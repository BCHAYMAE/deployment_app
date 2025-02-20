const express = require('express');
const cors = require('cors');
const simpleGit = require('simple-git');
const fs = require('fs');
const { exec } = require('child_process');
const path = require('path');
const http = require('http'); // Import HTTP module

const app = express();
const port = 5001;

const server = http.createServer(app); // Create HTTP server

// Enable CORS
app.use(cors());
app.use(express.json());

// Initialize simple-git
const git = simpleGit();

// Function to create a unique folder for each cloned repo
const generateUniqueFolderName = (repoUrl) => {
  const repoName = repoUrl.split('/').pop().replace('.git', '');
  const timestamp = Date.now();
  const uniqueName = `${repoName}-${timestamp}`;
  return path.join(__dirname, 'cloned-repos', uniqueName);
};

// Function to check if the cloned repo has the full-stack app structure
const isFullStackApp = (repoPath) => {
  const requiredFolders = ['frontend', 'backend', 'database'];
  return requiredFolders.every(folder => fs.existsSync(path.join(repoPath, folder)));
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
const detectFrontendTechnology = (repoPath) => {
  const packageJsonPath = path.join(repoPath, 'frontend', 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    const packageJson = require(packageJsonPath);
    if (packageJson.dependencies && packageJson.dependencies.react) {
      const viteJSBundlerPath = path.join(repoPath, 'frontend', 'vite.config.js');
      const viteTSBundlerPath = path.join(repoPath, 'frontend', 'vite.config.ts');
      if (fs.existsSync(viteJSBundlerPath) || fs.existsSync(viteTSBundlerPath)) {
        console.log('React with Vite detected');
        return 'react-vite';
      }
      console.log('React detected');
      return 'react';
    } else if (packageJson.dependencies && packageJson.dependencies.vue) {
      console.log('Vue detected');
      return 'vue';
    } else if (fs.existsSync(path.join(repoPath, 'frontend', 'angular.json'))) {
      console.log('Angular detected');
      return 'angular';
    }
  }
  console.log('Unknown frontend technology');
  return 'unknown';
};

// Function to detect the backend technology and its PORT
const detectBackendTechnology = (repoPath) => {
  const backendPath = path.join(repoPath, 'backend');
  const reqFilePath = path.join(backendPath, 'requirements.txt');

  // Node.js Detection
  if (fs.existsSync(path.join(backendPath, 'package.json'))) return 'nodejs';

  // Python Backend Detection
  if (fs.existsSync(reqFilePath)) {
    let buffer = fs.readFileSync(reqFilePath);
    let requirements = buffer.toString('utf16le'); // Convert from UTF-16 to string
    requirements = requirements.replace(/\r/g, '').trim().toLowerCase(); // Normalize line endings
    if (requirements.includes('flask')) return 'python-flask';
  }

  return 'unknown';
};

const detectPythonEntryFile = (repoPath) => {
  const backendPath = path.join(repoPath, 'backend');
  // Get all Python files
  const pyFiles = fs.readdirSync(backendPath).filter(file => file.endsWith('.py'));

  // Look for __main__ function
  for (const file of pyFiles) {
    const filePath = path.join(backendPath, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    if (content.includes('__main__')) return [file];
  }

  return null;
};

// Function to detect database used
const detectDatabase = (repoPath, backendTech) => {
  console.log(`Detecting database for backend technology: ${backendTech}`);

  const possiblePackagePaths = [
    path.join(repoPath, 'backend', 'package.json'),
    path.join(repoPath, 'package.json'),
  ];

  const possibleEnvPaths = [
    path.join(repoPath, 'backend', '.env'),
    path.join(repoPath, 'database', '.env'),
    path.join(repoPath, '.env'),
  ];

  switch (backendTech) {
    case 'nodejs': {
      let packageJson = null;
      for (const packageJsonPath of possiblePackagePaths) {
        if (fs.existsSync(packageJsonPath)) {
          try {
            packageJson = require(packageJsonPath);
            console.log(`Found package.json at ${packageJsonPath}`);
            break;
          } catch (error) {
            console.warn(`Failed to parse package.json at ${packageJsonPath}: ${error.message}`);
          }
        }
      }

      if (packageJson && packageJson.dependencies) {
        const deps = packageJson.dependencies;
        if (deps['mysql'] || deps['mysql2']) {
          console.log('MySQL detected in package.json');
          return 'mysql';
        }
        if (deps['pg']) {
          console.log('Postgres detected in package.json');
          return 'postgres';
        }
        if (deps['mongodb'] || deps['mongoose']) {
          console.log('MongoDB detected in package.json');
          return 'mongodb';
        }
        if (deps['redis']) {
          console.log('Redis detected in package.json');
          return 'redis';
        }
        if (deps['sqlite3']) {
          console.log('SQLite detected in package.json');
          return 'sqlite';
        }
      }
      break;
    }

    case 'python-flask': {
      const requirementsPath = path.join(repoPath, 'backend', 'requirements.txt');
      if (fs.existsSync(requirementsPath)) {
        try {
          const buffer = fs.readFileSync(requirementsPath, 'utf-8'); // Changed encoding
          const requirements = buffer.replace(/\r/g, '').trim().toLowerCase();

          if (requirements.includes('mysqlclient')) {
            console.log('MySQL detected in requirements.txt');
            return 'mysql';
          }
          if (requirements.includes('psycopg2')) {
            console.log('Postgres detected in requirements.txt');
            return 'postgres';
          }
          if (requirements.includes('pymongo')) {
            console.log('MongoDB detected in requirements.txt');
            return 'mongodb';
          }
        } catch (error) {
          console.warn(`Error reading requirements.txt: ${error.message}`);
        }
      }
      break;
    }

    default:
      console.log('No valid backend technology detected.');
      return 'unknown';
  }

  // Fallback: Check for .env files
  for (const envPath of possibleEnvPaths) {
    if (fs.existsSync(envPath)) {
      console.log(`Found .env file at ${envPath}`);
      const envContent = fs.readFileSync(envPath, 'utf-8');

      if (envContent.includes('DB_CONNECTION=mysql')) {
        console.log('MySQL detected in .env');
        return 'mysql';
      }
      if (envContent.includes('DB_CONNECTION=pgsql')) {
        console.log('Postgres detected in .env');
        return 'postgres';
      }
      if (envContent.includes('MONGO_URI')) {
        console.log('MongoDB detected in .env');
        return 'mongodb';
      }
      if (envContent.includes('REDIS_URL')) {
        console.log('Redis detected in .env');
        return 'redis';
      }
    }
  }

  console.log('No database detected.');
  return 'unknown';
};


// Function to create a Dockerfile for the frontend based on technology
const createFrontendDockerfile = (repoPath, frontendTech) => {
  let API_URL;
  let dockerfile;
  if (frontendTech == 'react' || frontendTech == 'react-vite' || frontendTech == 'vue') {
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
  } else if (frontendTech == 'angular') {
    API_URL = '';
  }

  fs.writeFileSync(path.join(repoPath, 'frontend', 'Dockerfile'), dockerfile);
};

// Function to create a Dockerfile for the backend based on technology
const createBackendDockerfile = (repoPath, backendTech) => {
  let dockerfile = '';
  switch (backendTech) {
    case 'nodejs': {
      const packageJson = require(path.join(repoPath, 'backend', 'package.json'));
      dockerfile = `
        # Dockerfile for Node.js backend
        FROM node:alpine
        WORKDIR /app
        COPY package*.json ./
        RUN npm install
        COPY ./ ./
        CMD ["node", "${packageJson.main}"]
      `;
      break;
    }

    case 'python-flask': {
      const pythonEntryFile = detectPythonEntryFile(repoPath);
      if (!pythonEntryFile || pythonEntryFile.length === 0) {
        throw new Error('No valid Python entry file found.');
      }
      dockerfile = `
        FROM python:latest
        WORKDIR /app
        COPY ./ ./
        RUN pip install --no-cache-dir -r ./requirements.txt
        CMD ["python", "${pythonEntryFile[0]}"]
      `;
      break;
    }

    default:
      throw new Error(`Unsupported backend technology: ${backendTech}`);
  }
  fs.writeFileSync(path.join(repoPath, 'backend', 'Dockerfile'), dockerfile);
};

// Function to create a Dockerfile for the database based on technology
const createDatabaseDockerfile = (repoPath, databaseType) => {
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

  fs.writeFileSync(path.join(repoPath, 'database', 'Dockerfile'), dockerfile);
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
    case 'angular':
      return 'dist/frontend/browser';
    default:
      return null; // Handle unsupported frontend tech
  }
};

// Function to create a docker-compose.yml file
const createDockerComposeFile = (repoPath, frontendTech, backendTech, databaseType) => {
  const frontendPath = getBuildPath(frontendTech);

  let frontendService = '';
  let backendService = '';
  let databaseService = '';

  if (frontendPath) {
    frontendService = `
      frontend:
        build:
          context: ./frontend
          dockerfile: Dockerfile
        volumes:
          - ./frontend/${frontendPath}:/app/${frontendPath}  # Valid volume mapping
        command: ["npm", "run", "build"]
        depends_on:
          - backend
    `;
  }

  switch (`${backendTech}-${databaseType}`) {
    case "nodejs-mysql":
      backendService = `
        backend:
          build:
            context: ./backend
            dockerfile: Dockerfile
          ports:
            - "4002:4002"
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
          build:
            context: ./database
            dockerfile: Dockerfile
          environment:
            MYSQL_ROOT_PASSWORD: root
            MYSQL_DATABASE: mydb
          ports:
            - "3307:3307"
          volumes:
            - db-data:/var/lib/mysql
            - ./database/init:/docker-entrypoint-initdb.d
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
          build:
            context: ./backend
            dockerfile: Dockerfile
          ports:
            - "4002:4002"
          depends_on:
           - db
          environment:
            - PORT=4002
            - MONGO_URI=mongodb://db:27017
      `;
      databaseService = `
        db:
          build:
            context: ./database
            dockerfile: Dockerfile
          ports:
            - "27017:27017"
          volumes:
            - db-data:/data/db
            - ./database/init:/docker-entrypoint-initdb.d
      `;
      break;
    case "nodejs-postgres":
      backendService = `
        backend:
          build:
            context: ./backend
            dockerfile: Dockerfile
          ports:
            - "4002:4002"
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
          build:
            context: ./database
            dockerfile: Dockerfile
          ports:
            - "5432:5432"
          environment:
            POSTGRES_USER: postgres
            POSTGRES_PASSWORD: postgres
            POSTGRES_DB: mydb
          volumes:
            - db-data:/var/lib/postgresql/data
            - ./database/init:/docker-entrypoint-initdb.d
          healthcheck:
            test: ["CMD-SHELL", "pg_isready -U postgres -d mydb"]
            interval: 10s
            retries: 5
            start_period: 30s
      `;
      break;
    case 'python-flask-mysql':
      backendService = `
        backend:
          build:
            context: ./backend
            dockerfile: Dockerfile
          ports:
            - "4002:4002"
          command: ["gunicorn", "-b", ":4002", "app:app"]
          depends_on:
            db:
              condition: service_healthy
          environment:
            - DB_HOST=db
            - DB_USER=root
            - DB_PASSWORD=root
            - DB_NAME=mydb
            - PORT=4002
      `;
      databaseService = `
        db:
          build:
            context: ./database
            dockerfile: Dockerfile
          environment:
            MYSQL_ROOT_PASSWORD: root
            MYSQL_DATABASE: mydb
          ports:
            - "3307:3307"
          volumes:
            - db-data:/var/lib/mysql
            - ./database/init:/docker-entrypoint-initdb.d
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
            build:
              context: ./backend
              dockerfile: Dockerfile
            ports:
              - "4002:4002"
            command: ["gunicorn", "-b", ":4002", "app:app"]
            depends_on:
              - db
            environment:
              - MONGO_URI=mongodb://db:27017
              - PORT=4002
      `;
      databaseService = `
        db:
          build:
            context: ./database
            dockerfile: Dockerfile
          ports:
            - "27017:27017"
          volumes:
            - db-data:/data/db
            - ./database/init:/docker-entrypoint-initdb.d
      `;
      break;
    default:
      throw new Error("Can't create backend or database services");
  }

  const dockerCompose = `
    services:
      ${frontendService.trim()}${frontendService ? '\n' : ''}
      ${backendService.trim()}${backendService ? '\n' : ''}
      ${databaseService.trim()}${databaseService ? '\n' : ''}

      nginx:
        image: nginx:alpine
        volumes:
          - ./nginx.conf:/etc/nginx/nginx.conf:ro
          - ./frontend/${frontendPath}:/usr/share/nginx/html  # Serve frontend files (Ensure frontendPath is correct)
          
        ports:
          - "8080:80"  # Expose Nginx on port 8080
        depends_on:
          - backend
          ${frontendPath ? "- frontend" : ""}
          - db

networks:
  app-network:
    driver: bridge

volumes:
  db-data:
  `;
  console.log(dockerCompose);
  // Ensure the output is correctly written to the file
  const dockerComposeFilePath = path.join(repoPath, 'docker-compose.yml');
  fs.writeFileSync(dockerComposeFilePath, dockerCompose.trim());  // Write to the final path
};

// Function to check nginx is serving
const checkNginx = async () => {
  try {
    const response = await fetch('http://localhost:8080'); // Checking the deployed frontend
    if (response.status === 200) {
      return true; // Nginx is ready
    }
    return false; // Nginx is not ready
  } catch (error) {
    console.error('Error checking Nginx:', error.message);
    return false; // Nginx is not ready
  }
};

// Clone the repository based on the URL provided in the request
app.post('/api/clone-repo', (req, res) => {
  const { repoUrl } = req.body;

  if (!repoUrl) {
    console.log('Repository URL is required'); 
    res.status(400).send('Repository URL is required');
    return;
  }

  // Create a unique folder for the new repository
  const clonePath = generateUniqueFolderName(repoUrl);
  

  // Clone the repository
  git.clone(repoUrl, clonePath)
    .then(async() => {         
      
      try {

        if (!isFullStackApp(clonePath)) {
          throw new Error("This project does not have a valid full-stack app structure.");
        }

         // Detect frontend and backend technologies
        const frontendTech = detectFrontendTechnology(clonePath);
        const backendTech = detectBackendTechnology(clonePath);
        const databaseTech = detectDatabase(clonePath, backendTech);

        console.log(frontendTech, backendTech, databaseTech);

        if(frontendTech === 'unknown'){
          throw new Error('Frontend technology not detected. Deployment cannot proceed.');
        }
        if(backendTech === 'unknown'){
          throw new Error('Backend technology not detected. Deployment cannot proceed.');
        }
        if(databaseTech === 'unknown'){
          throw new Error('Database technology not detected. Deployment cannot proceed.');
        }

        // Create Dockerfiles for frontend, backend and database
        createFrontendDockerfile(clonePath, frontendTech);
        createBackendDockerfile(clonePath, backendTech);
        createDatabaseDockerfile(clonePath, databaseTech);
              
  
        // Create dockerignore
        createDockerignore(clonePath);

        //create nginx.conf
        createNginxConfig(clonePath);
        
        // Create docker-compose.yml
        createDockerComposeFile(clonePath, frontendTech, backendTech, databaseTech);
                
        //Automatically build and deploy
        await new Promise((resolve, reject) => {
          exec(`cd ${clonePath} && docker-compose up --build -d`, (err, stdout, stderr) => {
              if (err) {
                  console.log("Deployment Error:", stderr);
                  if (stderr.includes("port is already allocated")) {
                      reject(new Error("Deployment Failed: Port Conflict. Another service is using the required port."));
                  } else if (stderr.includes("error during connect")) {
                      reject(new Error("Docker Desktop is not running. Please start Docker and try again."));
                  } else {
                      reject(new Error(`Error deploying application: ${stderr}`));
                  }
              } else {
                  console.log("Deployment Success:", stdout);
                  resolve();
              }
          });
      });

      // Check if Nginx is ready
      let retries = 50;
      let nginxReady = false;
      while (retries > 0 && !nginxReady) {
          nginxReady = await checkNginx();
          if (nginxReady) break;
          retries--;
          console.log('Waiting for Nginx to be ready...');
          await new Promise(resolve => setTimeout(resolve, 4000)); // Wait for 4 seconds
      }

      if (!nginxReady) {
          throw new Error("Deployment Failed: Nginx did not become ready within the expected time.");
      }
      console.log('Ready to go');
      res.status(200).send('Deployment successful');
      
  }catch(error) {
      console.error(`Error: ${error.message}`);
      deleteRepo(clonePath);
      res.status(500).send(`Error: ${error.message}`);
  }
})
.catch((err) => {
      console.log('Error cloning repo:', err);
      if(err.message.includes('Repository not found')){
        res.status(404).send('Repository not found');
      }else{
        console.log(`Error Cloning Repository: ${err.message}`);
        res.status(500).send(`Error Cloning Repository: ${err.message}`);
      }
    });
});


// Start the server
server.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});