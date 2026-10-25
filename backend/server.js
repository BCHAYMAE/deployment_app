const express = require('express');
const cors = require('cors');
const simpleGit = require('simple-git');
const fs = require('fs');
const { spawn } = require('child_process');
const path = require('path');
const http = require('http'); 
const { Server } = require('socket.io'); // Import socket.io


const app = express();
const port = 5001;
const frontendOrigins = new Set([
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
]);
const jobIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const activeDeploymentJobs = new Set();
const deploymentRateLimits = new Map();
const deploymentRateWindowMs = 60_000;
const maxDeploymentsPerWindow = 5;
const maxRepositorySizeBytes = 1024 * 1024 * 1024;
const maxRepositoryFiles = 100_000;
const cloneTimeoutMs = 2 * 60 * 1000;
const deploymentTimeoutMs = 10 * 60 * 1000;
const allowedRepositoryHosts = new Set(['github.com', 'gitlab.com', 'bitbucket.org']);

const server = http.createServer(app); // Create HTTP server
const io = new Server(server, {
    cors: {
        origin: [...frontendOrigins],
        methods: ["GET", "POST"]
    },
    maxHttpBufferSize: 16 * 1024,
    allowRequest: (request, callback) => {
      const origin = request.headers.origin;
      const host = request.headers.host?.toLowerCase();
      const isLocalHost = ['localhost:5001', '127.0.0.1:5001'].includes(host);
      const isLoopbackAddress = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.socket.remoteAddress);
      callback(null, isLocalHost && isLoopbackAddress && (!origin || frontendOrigins.has(origin)));
    },
});

app.use((req, res, next) => {
  const isLocalHost = ['localhost', '127.0.0.1'].includes(req.hostname);
  const isLoopbackAddress = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
  const origin = req.get('origin');

  if (!isLocalHost || !isLoopbackAddress || (origin && !frontendOrigins.has(origin))) {
    return res.status(403).json({
      status: 'failed',
      error: 'This deployment service only accepts requests from its local frontend.',
    });
  }

  return next();
});
app.use(cors({ origin: [...frontendOrigins], methods: ['GET', 'POST'] }));
app.use(express.json({ limit: '8kb' }));

app.use('/api/clone-repo', (req, res, next) => {
  const clientAddress = req.socket.remoteAddress;
  const now = Date.now();
  const currentLimit = deploymentRateLimits.get(clientAddress);
  const requestLimit = !currentLimit || now - currentLimit.startedAt >= deploymentRateWindowMs
    ? { startedAt: now, count: 0 }
    : currentLimit;

  if (requestLimit.count >= maxDeploymentsPerWindow) {
    return res.status(429).json({
      jobId: req.body?.jobId || null,
      status: 'failed',
      error: 'Too many deployment requests. Please wait a minute and try again.',
    });
  }

  requestLimit.count += 1;
  deploymentRateLimits.set(clientAddress, requestLimit);
  return next();
});


io.on('connection', (socket) => {
  console.log('Client connected');
  socket.on('join-job', (jobId, acknowledge) => {
    if (typeof jobId !== 'string' || !jobIdPattern.test(jobId)) {
      if (typeof acknowledge === 'function') acknowledge({ ok: false });
      return;
    }

    socket.join(jobId);
    if (typeof acknowledge === 'function') acknowledge({ ok: true });
  });
  socket.on('disconnect', () => {
      console.log('Client disconnected');
  });
});

const sendJobStatus = (jobId, status) => {
  io.to(jobId).emit('job:status', { jobId, ...status });
};

// Initialize simple-git
const git = simpleGit({ timeout: { block: cloneTimeoutMs } });

// Function to create a unique folder for each cloned repo
const generateUniqueFolderName = (repoUrl, workspace) => {
  const repository = new URL(repoUrl);
  const repoName = path.basename(repository.pathname).replace(/\.git$/, '');
  const timestamp = Date.now();
  return path.join(workspace, `${repoName}-${timestamp}`);
};

const validateRepositoryUrl = async (repoUrl) => {
  if (typeof repoUrl !== 'string' || repoUrl.length > 2048) return false;

  let repository;
  try {
    repository = new URL(repoUrl);
  } catch {
    return false;
  }

  const repositoryPathSegments = repository.pathname.split('/').filter(Boolean);
  const hasValidRepositoryPath = repositoryPathSegments.length >= 2
    && repositoryPathSegments.every((segment) => (
      segment !== '.'
      && segment !== '..'
      && /^[A-Za-z0-9_.-]+$/.test(segment)
    ))
    && repositoryPathSegments.at(-1) !== '.git';

  return repository.protocol === 'https:'
    && allowedRepositoryHosts.has(repository.hostname)
    && !repository.port
    && !repository.username
    && !repository.password
    && !repository.search
    && !repository.hash
    && hasValidRepositoryPath;
};

const getWorkerConfiguration = () => {
  const dockerHost = process.env.DEPLOYMENT_WORKER_DOCKER_HOST;
  const publicBaseUrl = process.env.DEPLOYMENT_PUBLIC_BASE_URL;
  const workspace = process.env.DEPLOYMENT_WORKSPACE;

  if (!dockerHost || !publicBaseUrl || !workspace || !path.isAbsolute(workspace)) {
    return null;
  }
  const resolvedWorkspace = path.resolve(workspace);
  const isWithinPath = (parent, candidate) => {
    const relativePath = path.relative(parent, candidate);
    return relativePath === ''
      || (!relativePath.startsWith(`..${path.sep}`)
        && relativePath !== '..'
        && !path.isAbsolute(relativePath));
  };

  if (resolvedWorkspace === path.parse(resolvedWorkspace).root
    || isWithinPath(__dirname, resolvedWorkspace)
    || isWithinPath(resolvedWorkspace, __dirname)) {
    return null;
  }

  let worker;
  let publicUrl;
  try {
    worker = new URL(dockerHost);
    publicUrl = new URL(publicBaseUrl);
  } catch {
    return null;
  }

  if (worker.protocol !== 'ssh:'
    || !worker.hostname
    || !worker.username
    || worker.pathname !== '/'
    || worker.password
    || worker.search
    || worker.hash
    || ['localhost', '127.0.0.1', '::1'].includes(worker.hostname)
    || publicUrl.protocol !== 'https:'
    || !publicUrl.hostname
    || publicUrl.username
    || publicUrl.password
    || publicUrl.search
    || publicUrl.hash) {
    return null;
  }

  return {
    dockerHost,
    publicBaseUrl: publicUrl.toString().replace(/\/$/, ''),
    workspace: resolvedWorkspace,
  };
};

const getRepositorySize = async (directory) => {
  let totalBytes = 0;
  let fileCount = 0;
  const pending = [directory];

  while (pending.length > 0) {
    const currentPath = pending.pop();
    const directoryHandle = await fs.promises.opendir(currentPath);
    for await (const entry of directoryHandle) {
      const entryPath = path.join(currentPath, entry.name);
      const details = await fs.promises.lstat(entryPath);
      if (details.isDirectory()) {
        pending.push(entryPath);
      } else if (details.isFile()) {
        fileCount += 1;
        totalBytes += details.size;
        if (totalBytes > maxRepositorySizeBytes || fileCount > maxRepositoryFiles) {
          return { totalBytes, fileCount };
        }
      }
    }
  }

  return { totalBytes, fileCount };
};

// Function to check if the cloned repo has the full-stack app structure and retrieves the folders name
const isFullStackApp = (repoPath) => {
  // Define possible folder names for each component
  const frontendNames = ['frontend', 'client', 'web', 'ui', 'app'];
  const backendNames = ['backend', 'server', 'api', 'services'];
  const databaseNames = ['database', 'db', 'data', 'storage'];

  // Function to find the folder name for a component
  const findComponentFolder = (componentNames) => {
    const folders = fs.readdirSync(repoPath);
    for (const folder of folders) {
      if (componentNames.includes(folder.toLowerCase())) {
        return folder; // Return the actual folder name
      }
    }
    return null; // Return null if no matching folder is found
  };

  // Find folders for each component
  const frontendFolder = findComponentFolder(frontendNames);
  const backendFolder = findComponentFolder(backendNames);
  const databaseFolder = findComponentFolder(databaseNames);

  // Check if all required components exist
  const valid = frontendFolder && backendFolder && databaseFolder;

  // Return the result as an object
  if(valid){
    return {frontend: frontendFolder, backend: backendFolder, database: databaseFolder}
  }
  return false;
};

// Deleting unwanted repos
const deleteRepo = (repoPath) => {
    try {
      fs.rmSync(repoPath, { recursive: true, force: true }); 
      console.log(`Repository at ${repoPath} has been deleted.`);
    } catch (err) {
      console.error('Error deleting the repository:', err);
    }
};

// Function to detect the frontend technology
const detectFrontendTechnology = (repoPath, folderName) => {
  const packageJsonPath = path.join(repoPath, folderName.frontend, 'package.json');
  if (fs.existsSync(packageJsonPath)) {

    const packageJson = require(packageJsonPath);
    if (packageJson.dependencies && packageJson.dependencies.react) {
      const viteJSBundlerPath = path.join(repoPath, folderName.frontend, 'vite.config.js');
      const viteTSBundlerPath = path.join(repoPath, folderName.frontend, 'vite.config.ts');
      if(fs.existsSync(viteJSBundlerPath) || fs.existsSync(viteTSBundlerPath)){
        return 'react-vite';
      }
      return 'react';
    } else if (packageJson.dependencies && packageJson.dependencies.vue) {
      return 'vue';
    } 
  }
  return 'unknown';
};

// Function to detect the backend technology and its PORT
const detectBackendTechnology = (repoPath, folderName) => {
  const backendPath = path.join(repoPath, folderName.backend);
  const reqFilePath = path.join(backendPath, 'requirements.txt');

  // ✅ Node.js Detection
  if (fs.existsSync(path.join(backendPath, 'package.json'))) return 'nodejs';

  // ✅ Python Backend Detection
  if (fs.existsSync(reqFilePath)) {

    let buffer = fs.readFileSync(reqFilePath);
    let requirements = buffer.toString('utf16le'); // Convert from UTF-16 to string
    requirements = requirements.replace(/\r/g, '').trim().toLowerCase(); // Normalize line endings

    if (requirements.includes('flask')) return 'python-flask';
  }
  return 'unknown';
};

const detectPythonEntryFile = (repoPath, folderName) => {
  const backendPath = path.join(repoPath, folderName.backend);
  // Get all Python files
  const pyFiles = fs.readdirSync(backendPath).filter(file => file.endsWith('.py'));

  // ✅ Look for __main__ function
  for (const file of pyFiles) {
      const filePath = path.join(backendPath, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      if (content.includes('__main__')) return [file];
  }

  return null;
};

// Function to detect database used
const detectDatabase = (repoPath, backendTech, folderName) => {

  // If no database is found in the backend, check the database folder for .env
  const databasePath = path.join(repoPath, folderName.database);
  if (fs.existsSync(databasePath)) {
    const envPath = path.join(databasePath, '.env');
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf-8');
      if (envContent.includes('DB_CONNECTION=mysql')) return 'mysql';
      if (envContent.includes('DB_CONNECTION=pgsql')) return 'postgres';
      if (envContent.includes('MONGO_URI')) return 'mongodb';
      
    }
  }

  switch (backendTech) {
    case 'nodejs': {
      const packageJsonPath = path.join(repoPath, folderName.backend, 'package.json');
      if (fs.existsSync(packageJsonPath)) {
        const packageJson = require(packageJsonPath);
        if (packageJson.dependencies) {
          if (packageJson.dependencies['mysql'] || packageJson.dependencies['mysql2']) return 'mysql';
          if (packageJson.dependencies['pg']) return 'postgres';
          if (packageJson.dependencies['mongodb'] || packageJson.dependencies['mongoose']) return 'mongodb';
        }
      }
      break;
    }

    case 'python-flask': {
      const requirementsPath = path.join(repoPath, folderName.backend, 'requirements.txt');
      if (fs.existsSync(requirementsPath)) {
        let buffer = fs.readFileSync(requirementsPath);
        let requirements = buffer.toString('utf16le');
        requirements = requirements.replace(/\r/g, '').trim().toLowerCase();
        if (requirements.includes('mysqlclient') ||
            requirements.includes('mysql-connector-python') ||
            requirements.includes('pymysql') ||
            requirements.includes('sqlalchemy') && requirements.includes('mysql')
        ) return 'mysql';
        if (requirements.includes('psycopg2')) return 'postgres';
        if (requirements.includes('pymongo')) return 'mongodb';
      }
      break; 
    }
    default:
      throw new Error('No database found!!');
  }
};


// Function to create a Dockerfile for the frontend based on technology
const createFrontendDockerfile = (repoPath, frontendTech, folderName) => {

  let API_URL;
  let dockerfile;
  if(frontendTech == 'react-vite' || frontendTech == 'vue'){
    API_URL = 'VITE_API_URL';
    dockerfile = `
    # Dockerfile for React app
      FROM node:alpine AS build
      ARG ${API_URL}
      ENV ${API_URL}='http://localhost:4002/api'
      WORKDIR /app
      COPY package*.json ./
      RUN npm install
      COPY ./ ./
  `;
  }else if(frontendTech == 'react'){
    API_URL ='REACT_APP_API_URL';
    dockerfile = `
    # Dockerfile for React app
      FROM node:alpine AS build
      ARG ${API_URL}
      ENV ${API_URL}='http://localhost:4002/api'
      WORKDIR /app
      COPY package*.json ./
      RUN npm install
      COPY ./ ./
  `;
  }
  
  
  
  fs.writeFileSync(path.join(repoPath, folderName.frontend, 'Dockerfile'), dockerfile);
};

// Function to create a Dockerfile for the backend based on technology
const createBackendDockerfile = (repoPath, backendTech, folderName) => {
  let dockerfile = '';
  switch (backendTech) {
    case 'nodejs': {
      const packageJson = require(path.join(repoPath, folderName.backend, 'package.json'));
      const mainFile = packageJson.main || 'index.js';
      if (typeof mainFile !== 'string'
        || path.posix.isAbsolute(mainFile)
        || mainFile.split(/[\\/]/).includes('..')
        || !/^[A-Za-z0-9_./-]+$/.test(mainFile)) {
        throw new Error('Node.js package.json contains an unsupported main entry path.');
      }
      dockerfile = `
        # Dockerfile for Node.js backend
        FROM node:alpine
        WORKDIR /app
        COPY package*.json ./
        RUN npm install
        COPY ./ ./
        CMD ${JSON.stringify(['node', mainFile])}
      `;
      break;
    }

    case 'python-flask': {
      const pythonEntryFile = detectPythonEntryFile(repoPath, folderName);
      if (!pythonEntryFile || pythonEntryFile.length === 0) {
        throw new Error('No valid Python entry file found.');
      }
      if (!/^[A-Za-z0-9_.-]+\.py$/.test(pythonEntryFile[0])) {
        throw new Error('Python entry file name contains unsupported characters.');
      }
      dockerfile = `
        FROM python:latest
        WORKDIR /app
        COPY ./ ./
        RUN pip install --no-cache-dir -r ./requirements.txt
        CMD ${JSON.stringify(['python', pythonEntryFile[0]])}
      `;
      break;
    }

    default:
      throw new Error(`Unsupported backend technology: ${backendTech}`);
  }
  fs.writeFileSync(path.join(repoPath, folderName.backend, 'Dockerfile'), dockerfile);
};

// Function to create a Dockerfile for the database based on technology
const createDatabaseDockerfile = (repoPath, databaseType, folderName) => {
  let dockerfile = '';

  switch (databaseType) {
    case 'mysql':
      dockerfile = `
        FROM mysql:latest
        VOLUME /var/lib/mysql
        EXPOSE 3307
      `;
      break;

    case 'postgres':
      dockerfile = `
        FROM postgres:latest
        VOLUME /var/lib/postgresql/data
        EXPOSE 5432
      `;
      break;

    case 'mongodb':
      dockerfile = `
        FROM mongo:latest
        VOLUME /data/db
        EXPOSE 27017
      `;
      break;

    case 'redis':
      dockerfile = `
        FROM redis:latest
        EXPOSE 6379
      `;
      break;

    default:
      console.log('No valid database detected.');
      return;
  }

  fs.writeFileSync(path.join(repoPath, folderName.database, 'Dockerfile'), dockerfile);
};

// generate nginx config
const createNginxConfig = (repoPath) => {
  const nginxConfig = `
    events {}

    http {
      include       mime.types;
      default_type  application/octet-stream;
      types {
        application/javascript js;
      }
        
      server {
          listen 80;

          location / {
            root /usr/share/nginx/html;
            index index.html;
            try_files $uri /index.html ;
          }

          # Forward all other requests to Backend
          location /api/ {
              proxy_pass http://backend:4002/;
              proxy_set_header Host $host;
              proxy_set_header X-Real-IP $remote_addr;
              proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
          }
      }
    }

  `;

  fs.writeFileSync(path.join(repoPath, 'nginx.conf'), nginxConfig);
};

// Function to create dockerignore
const createDockerignore = (repoPath) => {
  const dockerignoreContent = `
    node_modules
    logs
    *.log
    .env
    /build
    /dist
    /.next
    /out
    /.cache
    .vscode/
    .idea/
    .DS_Store
    Thumbs.db
    .git
    .gitignore
    __pycache__/
    *.pyc
    *.pyo
    *.pyd
    venv/
    vendor/
  `;
  fs.writeFileSync(path.join(repoPath, '.dockerignore'), dockerignoreContent);
};

// get build path
const getBuildPath = (frontendTech) => {
  switch (frontendTech) {
      case 'react':
          return 'build';
      case 'react-vite':
      case 'vue':
          return 'dist';
      default:
          return null; 
  }
};

// Function to create a docker-compose.yml file
const createDockerComposeFile = (repoPath, frontendTech, backendTech, databaseType, clonePath, folderName) => {
  const frontendPath = getBuildPath(frontendTech);
  // extract folder name
  const folderNameNetwork = path.basename(clonePath);    

  let frontendService = '';
  let backendService = '';
  let databaseService = '';

  if (frontendPath) {
    frontendService = `
      frontend:
        <<: *runtime-limits
        build:
          context: ./${folderName.frontend}
          dockerfile: Dockerfile
        volumes:
          - ./${folderName.frontend}/${frontendPath}:/app/${frontendPath}  # Valid volume mapping
        command: ["npm", "run", "build"]
        depends_on:
          - backend
    `;
  }
  

  switch(`${backendTech}-${databaseType}`){
    case "nodejs-mysql":
      backendService = `
        backend:
          <<: *runtime-limits
          build:
            context: ./${folderName.backend}
            dockerfile: Dockerfile
          depends_on:
            db:
              condition: service_healthy
          environment:
            - DB_HOST=db
            - DB_USER=root
            - DB_PASS=root
            - DB_NAME=mydb
            - PORT=4002
      `;
      databaseService = `
        db:
          <<: *runtime-limits
          build:
            context: ./${folderName.database}
            dockerfile: Dockerfile
          environment:
            MYSQL_ROOT_PASSWORD: root
            MYSQL_DATABASE: mydb
          volumes:
            - ${folderNameNetwork}-data:/var/lib/mysql
            - ./${folderName.database}/init:/docker-entrypoint-initdb.d:ro
          healthcheck:
            test: ["CMD", "mysqladmin", "ping", "-h", "127.0.0.1"]
            interval: 10s
            retries: 5
            start_period: 30s
      `;
      break;
    case 'nodejs-mongodb':
      backendService = `
        backend:
          <<: *runtime-limits
          build:
            context: ./${folderName.backend}
            dockerfile: Dockerfile
          depends_on:
           - db
          environment:
            - PORT=4002
            - MONGO_URI=mongodb://db:27017
      `;
      databaseService = `
        db:
          <<: *runtime-limits
          build:
            context: ./${folderName.database}
            dockerfile: Dockerfile

          volumes:
            - ${folderNameNetwork}-data:/data/db
            - ./${folderName.database}/init:/docker-entrypoint-initdb.d:ro
      `;
      break;
    case "nodejs-postgres":
      backendService = `
        backend:
          <<: *runtime-limits
          build:
            context: ./${folderName.backend}
            dockerfile: Dockerfile
          depends_on:
            db:
              condition: service_healthy

          environment:
            - PORT=4002
            - DB_HOST=db
            - DB_USER=postgres
            - DB_PASS=postgres
            - DB_NAME=mydb
      `;
      databaseService = `
        db:
          <<: *runtime-limits
          build:
            context: ./${folderName.database}
            dockerfile: Dockerfile

          environment:
            POSTGRES_USER: postgres
            POSTGRES_PASSWORD: postgres
            POSTGRES_DB: mydb
          volumes:
            - ${folderNameNetwork}-data:/var/lib/postgresql/data
            - ./${folderName.database}/init:/docker-entrypoint-initdb.d:ro
          healthcheck:
            test: ["CMD-SHELL", "pg_isready -U postgres -d mydb"]
            interval: 10s
            retries: 5
            start_period: 30s
      `;
      break;
    case 'python-flask-mysql':
      backendService=`
        backend:
          <<: *runtime-limits
          build:
            context: ./${folderName.backend}
            dockerfile: Dockerfile
          command: ["gunicorn", "-b", ":4002", "app:app"]
          depends_on:
            db:
              condition: service_healthy
          environment:
            - DB_HOST=db
            - DB_USER=root
            - DB_PASS=root
            - DB_NAME=mydb
            - PORT=4002
      `;
      databaseService=`
        db:
          <<: *runtime-limits
          build:
            context: ./${folderName.database}
            dockerfile: Dockerfile
          environment:
            MYSQL_ROOT_PASSWORD: root
            MYSQL_DATABASE: mydb
          volumes:
            - ${folderNameNetwork}-data:/var/lib/mysql
            - ./${folderName.database}/init:/docker-entrypoint-initdb.d:ro
          healthcheck:
            test: ["CMD", "mysqladmin", "ping", "-h", "127.0.0.1"]
            interval: 10s
            retries: 5
            start_period: 30s
      `;
      break;
    case "python-flask-mongodb": 
      backendService = `
        backend:
            <<: *runtime-limits
            build:
              context: ./${folderName.backend}
              dockerfile: Dockerfile
            command: ["gunicorn", "-b", ":4002", "app:app"]
            depends_on:
              - db
            environment:
              - MONGO_URI=mongodb://db:27017
              - PORT=4002
      `;
      databaseService = `
        db:
          <<: *runtime-limits
          build:
            context: ./${folderName.database}
            dockerfile: Dockerfile

          volumes:
            - ${folderNameNetwork}-data:/data/db
            - ./${folderName.database}/init:/docker-entrypoint-initdb.d:ro
      `;
      break;
    default:
      throw new Error("Can't create backend or database services");
  }
  


  const dockerCompose = `
    x-runtime-limits: &runtime-limits
      deploy:
        resources:
          limits:
            cpus: "1.0"
            memory: 512M
            pids: 128

services:
  ${frontendService.trim()}${frontendService ? '\n' : ''}
  ${backendService.trim()}${backendService ? '\n' : ''}
  ${databaseService.trim()}${databaseService ? '\n' : ''}

  nginx:
        <<: *runtime-limits
        image: nginx:alpine
        volumes:
          - ./nginx.conf:/etc/nginx/nginx.conf:ro
          - ./${folderName.frontend}/${frontendPath}:/usr/share/nginx/html:ro
          
        ports:
          - "127.0.0.1:8081:80"
        depends_on:
          - backend
          ${frontendPath ? "- frontend" : ""}
          - db

networks:
  default:
    driver: bridge
    internal: true

volumes:
  ${folderNameNetwork}-data:
  `;
  console.log(dockerCompose);
  // Ensure the output is correctly written to the file
  const dockerComposeFilePath = path.join(repoPath, 'docker-compose.yml');
  fs.writeFileSync(dockerComposeFilePath, dockerCompose.trim());  // Write to the final path
};

const runDockerCommand = (dockerHost, args, timeoutMs) => new Promise((resolve, reject) => {
  const child = spawn('docker', ['--host', dockerHost, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  let timedOut = false;
  let forceKillTimer;

  const appendTail = (current, chunk) => `${current}${chunk}`.slice(-16_384);
  const timeout = setTimeout(() => {
    timedOut = true;
    child.kill('SIGTERM');
    forceKillTimer = setTimeout(() => child.kill('SIGKILL'), 5000);
  }, timeoutMs);

  child.stdout.on('data', (chunk) => {
    stdout = appendTail(stdout, chunk.toString());
  });
  child.stderr.on('data', (chunk) => {
    stderr = appendTail(stderr, chunk.toString());
  });
  child.on('error', (error) => {
    clearTimeout(timeout);
    clearTimeout(forceKillTimer);
    reject(error);
  });
  child.on('close', (code) => {
    clearTimeout(timeout);
    clearTimeout(forceKillTimer);
    if (timedOut) {
      reject(new Error(`Docker worker command exceeded the ${Math.round(timeoutMs / 1000)} second time limit.`));
    } else if (code !== 0) {
      reject(new Error(stderr.trim() || `Docker worker command exited with code ${code}.`));
    } else {
      resolve(stdout.trim());
    }
  });
});

const runDockerCompose = (worker, clonePath, jobId, args, timeoutMs) => runDockerCommand(
  worker.dockerHost,
  [
    'compose',
    '--project-directory', clonePath,
    '--env-file', '/dev/null',
    '--project-name', `deploy-${jobId.replaceAll('-', '')}`,
    '--file', path.join(clonePath, 'docker-compose.yml'),
    ...args,
  ],
  timeoutMs,
);

const checkNginx = async (deploymentUrl) => {
  try {
    const response = await fetch(deploymentUrl, { signal: AbortSignal.timeout(5000) });
    return response.status === 200;
  } catch (error) {
    console.error('Error checking Nginx:', error.message);
    return false;
  }
};

app.post('/api/clone-repo', async (req, res) => {
  const { repoUrl, jobId } = req.body || {};
  const isValidJobId = typeof jobId === 'string' && jobIdPattern.test(jobId);

  if (!isValidJobId) {
    return res.status(400).json({
      jobId: null,
      status: 'failed',
      error: 'A valid job ID is required.',
    });
  }

  const worker = getWorkerConfiguration();
  if (!worker) {
    const error = 'Secure deployment worker is not configured. See the README security setup.';
    sendJobStatus(jobId, { message: error, level: 'error' });
    return res.status(503).json({ jobId, status: 'failed', error });
  }

  if (typeof repoUrl !== 'string' || !(await validateRepositoryUrl(repoUrl))) {
    const error = 'Repository URL must be HTTPS on github.com, gitlab.com, or bitbucket.org.';
    sendJobStatus(jobId, { message: error, level: 'error' });
    return res.status(400).json({ jobId, status: 'failed', error });
  }

  if (activeDeploymentJobs.size > 0 || activeDeploymentJobs.has(jobId)) {
    const error = 'Another deployment is already running. Please try again when it finishes.';
    sendJobStatus(jobId, { message: error, level: 'error' });
    return res.status(429).json({ jobId, status: 'failed', error });
  }

  activeDeploymentJobs.add(jobId);
  let clonePath;
  let composeWasStarted = false;

  try {
    const workerInfo = await runDockerCommand(
      worker.dockerHost,
      ['info', '--format', '{{json .SecurityOptions}}|{{.CgroupVersion}}'],
      15_000,
    );
    const [securityOptions, cgroupVersion] = workerInfo.split('|');
    if (!securityOptions?.toLowerCase().includes('rootless') || cgroupVersion !== '2') {
      throw new Error('Deployment worker must use rootless Docker with cgroup v2.');
    }

    fs.mkdirSync(worker.workspace, { recursive: true });
    clonePath = generateUniqueFolderName(repoUrl, worker.workspace);
    sendJobStatus(jobId, { message: 'Cloning repository...', level: 'info' });
    await git.clone(repoUrl, clonePath, ['--depth=1']);

    const repositorySize = await getRepositorySize(clonePath);
    if (repositorySize.totalBytes > maxRepositorySizeBytes
      || repositorySize.fileCount > maxRepositoryFiles) {
      throw new Error('Repository exceeds the checkout limits of 1 GB or 100,000 files.');
    }

    const repoFoldersName = isFullStackApp(clonePath);
    if (!repoFoldersName) {
      throw new Error('This project does not have a valid full-stack app structure.');
    }

    sendJobStatus(jobId, { message: 'Repository cloned. Detecting technologies...', level: 'info' });
    const frontendTech = detectFrontendTechnology(clonePath, repoFoldersName);
    const backendTech = detectBackendTechnology(clonePath, repoFoldersName);
    const databaseTech = detectDatabase(clonePath, backendTech, repoFoldersName);

    if (frontendTech === 'unknown' || backendTech === 'unknown' || databaseTech === 'unknown') {
      throw new Error('Could not detect a supported frontend, backend, and database combination.');
    }

    sendJobStatus(jobId, { message: 'Creating isolated deployment configuration...', level: 'info' });
    createFrontendDockerfile(clonePath, frontendTech, repoFoldersName);
    createBackendDockerfile(clonePath, backendTech, repoFoldersName);
    createDatabaseDockerfile(clonePath, databaseTech, repoFoldersName);
    createDockerignore(clonePath);
    createNginxConfig(clonePath);
    createDockerComposeFile(clonePath, frontendTech, backendTech, databaseTech, clonePath, repoFoldersName);

    sendJobStatus(jobId, { message: 'Building and deploying on the isolated worker...', level: 'info' });
    composeWasStarted = true;
    await runDockerCompose(worker, clonePath, jobId, ['up', '--build', '--detach'], deploymentTimeoutMs);

    const deploymentUrl = `${worker.publicBaseUrl}/`;
    let retries = 50;
    let nginxReady = false;
    while (retries > 0 && !nginxReady) {
      nginxReady = await checkNginx(deploymentUrl);
      if (nginxReady) break;
      retries--;
      await new Promise(resolve => setTimeout(resolve, 4000));
    }

    if (!nginxReady) {
      throw new Error('Deployment failed: the public deployment URL did not become ready.');
    }

    sendJobStatus(jobId, { message: 'Deployment completed successfully!', level: 'success' });
    sendJobStatus(jobId, {
      message: 'View deployed app',
      level: 'link',
      url: deploymentUrl,
    });
    return res.json({ jobId, status: 'succeeded', deploymentUrl });
  } catch (error) {
    console.error(`Deployment job ${jobId} failed:`, error);
    if (composeWasStarted && clonePath) {
      try {
        await runDockerCompose(
          worker,
          clonePath,
          jobId,
          ['down', '--volumes', '--remove-orphans'],
          60_000,
        );
      } catch (cleanupError) {
        console.error(`Could not clean up worker deployment ${jobId}:`, cleanupError);
      }
    }
    if (clonePath) deleteRepo(clonePath);

    const message = error.message.includes('Repository not found')
      ? 'Repository not found. Please check the repository URL.'
      : error.message;
    sendJobStatus(jobId, { message, level: 'error' });
    return res.status(500).json({ jobId, status: 'failed', error: message });
  } finally {
    activeDeploymentJobs.delete(jobId);
  }
});

app.use((error, req, res, next) => {
  if (error.type === 'entity.too.large') {
    return res.status(413).json({
      jobId: req.body?.jobId || null,
      status: 'failed',
      error: 'Request body exceeds the 8 KB limit.',
    });
  }

  return next(error);
});

// Start the server
server.listen(port, '127.0.0.1', () => {
  console.log(`Server running on http://localhost:${port}`);
});