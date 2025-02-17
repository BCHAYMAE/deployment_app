// Import dependencies
const express = require('express'); // Express framework
const cors = require('cors'); // Middleware for cross-origin requests
const simpleGit = require('simple-git'); // Library for running Git commands
const path = require('path'); // Module to handle file paths
const fs = require('fs'); // File system module
const { exec } = require('child_process'); // To execute shell commands

// Initialize express app
const app = express();
const git = simpleGit();

// Middleware
app.use(cors()); // Allow API calls from different origins
app.use(express.json()); // Parse incoming JSON requests

// Define the directory where repositories will be cloned
const CLONE_DIR = path.join(__dirname, 'cloned_repos');

// Ensure the clone directory exists
if (!fs.existsSync(CLONE_DIR)) {
    fs.mkdirSync(CLONE_DIR);
}

// Function to check if a repo has a full-stack structure
const isFullStackApp = (repoPath) => {
    const frontendFolders = ['frontend', 'client'];
    const backendFolders = ['backend', 'server'];
    const databaseFolders = ['database', 'db'];

    const hasFrontend = frontendFolders.some(folder => fs.existsSync(path.join(repoPath, folder)));
    const hasBackend = backendFolders.some(folder => fs.existsSync(path.join(repoPath, folder)));
    const hasDatabase = databaseFolders.some(folder => fs.existsSync(path.join(repoPath, folder)));

        return hasFrontend && hasBackend && hasDatabase;
};

// Function to delete a repo if it's not full-stack
const deleteRepo = (repoPath) => {
    try {
        fs.rmSync(repoPath, { recursive: true, force: true }); 
        console.log(`Repository at ${repoPath} has been deleted.`);
    } catch (err) {
        console.log('Error deleting the repository:', err);
    }
};

// Detect frontend technology
const detectFrontendTechnology = (repoPath) => {
    const packageJsonPath = path.join(repoPath, 'frontend', 'package.json');
    if (fs.existsSync(packageJsonPath)) {
    
        const packageJson = require(packageJsonPath);// load it from the specified path
        //&&:true if both expressions are true, otherwise, it returns false
        if(packageJson.dependencies && packageJson.dependencies.react){ //check if react is in the dependencies
            const viteJsPath = path.join(repoPath, 'frontend', 'vite.config.js');//path to vite config file 
            if(fs.existsSync(viteJsPath)){
                return 'react-vite';
            }
            return 'react';
        } else if (packageJson.dependencies && packageJson.dependencies.vue){ //check if vue is in the dependencies
            return 'vue';
        } else if (fs.existsSync(path.join(repoPath, 'frontend', 'angular.json')))//check if it exists in the frontend folder
            return 'angular';
    }
    return 'Unknown';
};

// Detect backend technology
const detectBackendTechnology = (repoPath) => {
    const backendPath = path.join(repoPath, 'backend');
    const reqFilePath = path.join(backendPath, 'requirements.txt');
  
    //Node.js Detection
    if (fs.existsSync(path.join(backendPath, 'package.json'))) return 'nodejs';
  
    //Python Backend Detection
    if (fs.existsSync(reqFilePath)) {
  
      let buffer = fs.readFileSync(reqFilePath);
      let requirements = buffer.toString('utf16le'); // Convert from UTF-16 to string
      requirements = requirements.replace(/\r/g, '').trim().toLowerCase(); // Normalize line endings
  
      if (requirements.includes('flask')) return 'python-flask';
    }
  
    return 'unknown';
};
const detectNodeEntryFile = (repoPath) => {
   try{
    //attempt to read the package json 
    const packageJson = require(path.join(repoPath, 'backend', 'package.json'));
    if(packageJson.main) 
        return [packageJson.main];//if the main field is specified retur it as the entry file
   } catch (error) {
    console.log('Error reading package.json :', error);
   }
   //fallback return common nodejs entryfiles
   return['server.js', 'index.js', 'app.js'];
};
const detectPython = (repoPath) => {
    const backendPath = path.join(repoPath, 'backend'); //define the path to the backend folder

    //prioritize manage.py if it exists (common in django projects)
    if(fs.existsSync(path.join(backendPath, 'manage.py'))) return ['manage.py'];
    //get all python files in the backend folder
    const pythonFile = fs.readdirSync(backendPath).filter(file => file.endsWith('.py'));
    //look for __main__ fct in py files to determine the entry point
    for (const file of pythonFile){
        const pathFile = path.join(backendPath, file);
        const content = fs.readFileSync(pathFile, 'utf-8');
        if (content.includes('__main__')) return [file];
    }
    //if no clear entry file is found, return null
    return null;
};

const backendPort = (repoPath, technology) => {
    // Check for the existence of '.env' file for port config
    const envFilePath = path.join(repoPath, 'backend', '.env');
    if (fs.existsSync(envFilePath)) {
        const envContent = fs.readFileSync(envFilePath, 'utf-8');
        // Look for port variable in the '.env' file
        const matchPort = envContent.match(/\w*PORT\s*=\s*(\d+)/);
        if (matchPort) {
            return parseInt(matchPort[1], 10); // Return port number if found
        }
    }

    // Default ports for different technologies
    const defaultPorts = {
        nodejs: 5000,
        python: 8000,
        php: 8080,
    };

    // Return default port for the technology if not found in '.env'
    if (defaultPorts[technology]) {
        return defaultPorts[technology];
    }

    // If no '.env' file is found, check for port definition in known backend files
    const portPatterns = {
        nodejs: /listen\s*\(\s*(\d+)/,
        python: /run\(\s*host=.*?,\s*port\s*=\s*(\d+)/,
        php: /'port'\s*=>\s*(\d+)/,
    };

    const filesToCheck = {
        nodejs: detectNodeEntryFile(repoPath),
        python: detectPython(repoPath),
        php: ['config/app.php'], // Laravel config file for PHP
    };

    if (!filesToCheck[technology]) {
        return 'Invalid technology';
    }

    // For the given technology, check the corresponding entry files
    for (const file of filesToCheck[technology]) {
        const filePath = path.join(repoPath, 'backend', file);
        if (fs.existsSync(filePath)) {
            const content = fs.readFileSync(filePath, 'utf-8');
            // Check for port pattern in the file
            const match = content.match(portPatterns[technology]);
            if (match) {
                return parseInt(match[1], 10); // Return port number if matched
            }
        }
    }

    // If no port is found
    return 'No port found';
};


//fnt to detect the database
const detectDatabase = (repoPath) => {
    //detect backend tech
    const backendTech = detectBackendTechnology(repoPath);

    //check backend dependencies for database libraries
    if(backendTech === 'nodejs') {
        const packageJsonPath = path.join(repoPath, 'backend', 'package.json');
        if (fs.existsSync(packageJsonPath)) {
            const packageJson = require(packageJsonPath);
            const dependencies = packageJson.dependencies || {} ;

            //check for common database libraries in package.json
                if(dependencies['mysql']) return 'mysql';
                if(dependencies['pg']) return 'postgres';
                if(dependencies['mongodb']) return 'mongodb';
                if(dependencies['redis']) return 'redis';
                if(dependencies['sqlite3']) return 'squile';
            }

    } else if (backendTech === 'python') {
        const requirementsPath = path.join(repoPath, 'backend', 'requirements.txt');
        if (fs.existsSync(requirementsPath)) {
            const requirements = fs.readFileSync(requirementsPath, 'utf-8');
            if (requirements.includes('psycopg2')) return 'postgres';
            if (requirements.includes('mysql-connector-python')) return 'mysql';
            if (requirements.includes('pymongo')) return 'mongodb';
            if (requirements.includes('redis')) return 'redis';
            if (requirements.includes('sqlite3')) return 'sqlite';
        }
    }

    //scan .env files for database connection variables
    const envPaths = [
        //check backend environment file
        path.join(repoPath, 'backend', '.env'),
        // Check database-specific .env file
        path.join(repoPath, 'database', '.env')
    ];

    for (const envPath of envPaths) {
        if(fs.existsSync(envPath)){ //check if the .env filr exists
            const envContent = fs.readFileSync(envPath, 'utf-8');//read file content as a string

            //search for common database connection variables in .env
            if (/DB_CONNECTION\s*=\s*mysql/i.test(envContent)) return 'mysql';
            if (/DB_CONNECTION\s*=\s*pgsql/i.test(envContent)) return 'postgres';
            if (/MONGO_URI\s*=\s*mongodb/i.test(envContent)) return 'mongodb';
            if (/REDIS_URL\s*=\s*redis/i.test(envContent)) return 'redis';
            if (/DB_CONNECTION\s*=\s*sqlite/i.test(envContent)) return 'sqlite';
        }
    }

        //check for sqlite database files
        const databasePaths = path.join(repoPath, 'database');
        if(fs.existsSync(databasePaths)) {
            const databaseFiles = fs.readdirSync(databasePaths);
            for (const file of databaseFiles) {
                if (file.endsWith('.sqlite') || file.endsWith('.db')) return 'sqlite';
            }
        }

    //scan common backend config file for database mentions
    const configFiles = [
        //node.js config file
        path.join(repoPath, 'backend', 'config.js'),
        //another possible node.js DB config file
        path.join(repoPath, 'backend', 'database.js'),
        //laravel (php) database config
        path.join(repoPath, 'backend', 'config/database.php')
    ];

    for (const configFile of configFiles) {
        if (fs.existsSync(configFile)) {
            const content = fs.readFileSync(configFile, 'utf-8');
            //search for database keywords in config files
            if(/mysql/i.test(content)) return 'mysql';
            if(/postgres/i.test(content) || /pg:/i.test(content)) return 'postgres' ;
            if(/mongodb/i.test(content) || /mongo:/i.test(content)) return 'mongodb';
            if(/redis/i.test(content)) return 'redis';
            if(/sqlite/i.test(content)) return 'sqlite';
        }
    }
    //check for sqlite database files in the database folder
    const databasePath = path.join(repoPath, 'database');
    if(fs.existsSync(databasePath)){
        const databaseFiles = fs.readdirSync(databasePath).map(file => file);

        //if any file has an sqlite database extension, return 'sqlite'
        for(const file of databaseFiles){
            if (file.endsWith('.sqlite') || file.endsWith('.db')) return 'sqlite';
        }
    }
    //no database detected
    return 'unknown';
}; 

    const frontendDockerfile = (repoPath, frontendTech) => {
        //initialize an empty string to store the dockerfile content
        let dockerfile = '';

        //check if the frontend tech ids react (or vite),vue or angulair
        if (frontendTech === 'react-vite' || frontendTech === 'react') {
            dockerfile = `
        # Dockerfile for React (Vite) application
            FROM node:18 AS build
            WORKDIR /app
            COPY package.json ./
            RUN npm install
            COPY . ./
            RUN npm run build

            FROM nginx:alpine
            COPY --from=build /app/dist /usr/share/nginx/html
            EXPOSE 80
            CMD ["nginx", "-g", "daemon off;"]
        `;
        } else if (frontendTech === 'vue') {
            dockerfile = `
            # Dockerfile for Vue application
            FROM node:18 AS build
            WORKDIR /app
            COPY package.json ./
            RUN npm install
            COPY . ./
            RUN npm run build
    
            FROM nginx:alpine
            COPY --from=build /app/dist /usr/share/nginx/html
            EXPOSE 80
            CMD ["nginx", "-g", "daemon off;"]
            `;
        } else if (frontendTech === 'angular') {
            dockerfile = `
            # Dockerfile for Angular application
            FROM node:18 AS build
            WORKDIR /app
            COPY package.json ./
            RUN npm install
            COPY . ./
            RUN npm run build
    
            FROM nginx:alpine
            COPY --from=build /app/dist /usr/share/nginx/html
            EXPOSE 80
            CMD ["nginx", "-g", "daemon off;"]
            `;
        };
        //write the generated Dockerfile content into thr frontend directory
        fs.writeFileSync(path.join(repoPath, 'frontend', 'Dockerfile'), dockerfile);
    };

    const backendDockerfile = (repoPath, backendTech) => {
        //initialize an empty string to store the Dockerfile content
        let dockerfile = '';
    
        if (backendTech === 'nodejs') {
            const packageJsonPath = path.join(repoPath, 'backend', 'package.json');
            if (!fs.existsSync(packageJsonPath)) {
                throw new Error('package.json not found in backend folder');
            }
    
            dockerfile = `
            # Dockerfile for Node.js application
            FROM node:18
            WORKDIR /app
            COPY package.json ./
            RUN npm install
            COPY . ./
            EXPOSE ${backendPort(repoPath, backendTech)}
            CMD ["node", "server.js"]
            `;
        } else if (backendTech === 'python') {
            const requirementsPath = path.join(repoPath, 'backend', 'requirements.txt');
            if (!fs.existsSync(requirementsPath)) {
                throw new Error('requirements.txt not found in backend folder');
            }
    
            dockerfile = `
            # Dockerfile for Python application
            FROM python:3.10
            WORKDIR /app
            COPY requirements.txt ./
            RUN pip install -r requirements.txt
            COPY . ./
            EXPOSE ${backendPort(repoPath, backendTech)}
            CMD ["python", "app.py"]
            `;
        } else if (backendTech === 'php-laravel') {
            const composerJsonPath = path.join(repoPath, 'backend', 'composer.json');
            if (!fs.existsSync(composerJsonPath)) {
                throw new Error('composer.json not found in backend folder');
            }
    
            dockerfile = `
            # Dockerfile for Laravel (PHP) application
            FROM php:8.1-fpm
            WORKDIR /app
            COPY composer.json composer.lock ./
            RUN composer install --no-dev --optimize-autoloader
            COPY . ./
            EXPOSE ${backendPort(repoPath, backendTech)}
            CMD ["php", "artisan", "serve", "--host=0.0.0.0", "--port=${backendPort(repoPath, backendTech)}"]
            `;
        } else if (backendTech === 'java-spring') {
            const pomXmlPath = path.join(repoPath, 'backend', 'pom.xml');
            if (!fs.existsSync(pomXmlPath)) {
                throw new Error('pom.xml not found in backend folder');
            }
    
            dockerfile = `
            # Dockerfile for Spring Boot (Java) application
            FROM openjdk:17-jdk-alpine
            WORKDIR /app
            COPY mvnw pom.xml ./
            COPY .mvn ./.mvn
            RUN ./mvnw dependency:go-offline
            COPY src ./src
            RUN ./mvnw package -DskipTests
            EXPOSE ${backendPort(repoPath, backendTech)}
            CMD ["java", "-jar", "target/your-app.jar"]
            `;
        } else if (backendTech === 'ruby-rails') {
            const gemfilePath = path.join(repoPath, 'backend', 'Gemfile');
            if (!fs.existsSync(gemfilePath)) {
                throw new Error('Gemfile not found in backend folder');
            }
    
            dockerfile = `
            # Dockerfile for Ruby on Rails application
            FROM ruby:3.1
            WORKDIR /app
            COPY Gemfile Gemfile.lock ./
            RUN bundle install
            COPY . ./
            EXPOSE ${backendPort(repoPath, backendTech)}
            CMD ["rails", "server", "-b", "0.0.0.0", "-p", "${backendPort(repoPath, backendTech)}"]
            `;
        } else if (backendTech === 'go') {
            const goModPath = path.join(repoPath, 'backend', 'go.mod');
            if (!fs.existsSync(goModPath)) {
                throw new Error('go.mod not found in backend folder');
            }
    
            dockerfile = `
            # Dockerfile for Go application
            FROM golang:1.19
            WORKDIR /app
            COPY go.mod go.sum ./
            RUN go mod download
            COPY . ./
            RUN go build -o main .
            EXPOSE ${backendPort(repoPath, backendTech)}
            CMD ["./main"]
            `;
        } else {
            throw new Error(`Unsupported backend technology: ${backendTech}`);
        }
    
        fs.writeFileSync(path.join(repoPath, 'backend', 'Dockerfile'), dockerfile);
    };

    const databaseDockerfile = (repoPath, backendPort) => {
        const database = detectDatabase(repoPath);

        let databaseService = '';
        if (database === 'mysql'){
            databaseService = `
            db: 
                image: mysql:latest
                restart: always
                environment:
                    MYSQL_ROOT_PASSWARD: root
                    MYSQL_DATABASE: app_db
                ports:
                    - "3306:3306"
                `;
        } else if (database === 'postgres') {
            databaseService = `
            db:
                image: postgres:latest
                restart: always
                enviroment:
                    POSTGRES_USER: user
                    POSTGRES_PASSWORD: password 
                    POSTGRES_DB: app_db
                ports:
                    - "5432:54323
            `;
        }else if (database === 'mongodb'){
            databaseService = `
            db:
                image : redis:latest
                restart: always
                ports:
                    - "6379:6379"
        `;
        }

        const dockerComposeContent = `
           version: '3'
           services:
            frontend:
                build:
                    context: ./frontend
                    dockerfile: Dockerfile
                ports:
                    - "80:80"
                networks:
                    - app-network
            backend:
                    build:
                        context: ./backend
                        dockerfile: Dockerfile
                    ports:
                        - "${backendPort}:${backendPort}"
                    depends_on:
                        - db
                    networks:
                        - app-network
                    ${databaseService}
                networks:
                    app-network
                        driver:bridge
             `;
        fs.writeFileSync(path.join(repoPath, 'docker-compose.yml'), dockerComposeContent);
    ;
    }
    //fct to create a dockerignore file
    const Dockerignore = (repoPath) => {
        const dockerignoreContent = `
        #ignore dependencies and build artifacts
        node_modules
        logs
        *.log
        .env
        
        #ignore front and backend build outputs
        /build
        /dist
        /.next
        /out
        /.cache
        
        #ignore IDE/editor-specific files
        .vscode/
        .idea/
        .DS_Store
        Thumbs.db
        
        #ignore git-related files
        .git
        .gitignore
        
        #ingnore python-related files
        __pycache__/
        *.pyc
        *.pyo
        *.pyd
        venv/
        
        #ignore php vendor directory
        vendor/
        `;
        //write the .dockerignore file in the repo root
        fs.writeFileSync(path.join(repoPath, '.dockerignore'), dockerignoreContent);
    };

    //fct to create a docker-compose.yml file
    const createDockerComposerFile = (repoPath, port) => {
        const dockerCompose = `
       #define the Docher compose version
        
        services:
        #frontend service
        frontend:
            build:
                #set the frontend build context
                context: ./frontend 
                #use the frontend dockerfile
                dockerfile: Dockerfile
            ports:
                #map container port 80 to host 80
                - "80:80"
            network:
                #connect frontend to the shared network
                - app-network
                
            #backend service
            backend:
                build:
                    #set the backend build context
                    context: ./backend
                    #use the backend Dockerfile
                    dockerfile: Dockerfile
                ports:
                    #map backend port dynamicallybased on detected port
                    - "${port}:${port}"
                networks:
                    #connect backend to the shared network
                    - app-network
                    
                    #define a network for the services to communicate
                    networks:
                        app-network:
                            driver: bridge
                             `;
        // write the docker-compose.yml file in the repo root
        fs.writeFileSync(path.join(repoPath, 'docker-compose.yml'), dockerCompose);
    };


const sanitizeRepoUrl = (url) => {
    //ensure the url is a valid Github url
    if(!url.startsWith('https://github.com/')){
        throw new Error ('Invalid reposirtory URL');
    }
    return url;
};
// API endpoint to clone a GitHub repo
app.post('/api/clone', async (req, res) => {
    const { repourl } = req.body;
    //sanitize the url
    const sanitizeUrl = sanitizeRepoUrl(repourl);
    // Validate input
    if (!repourl) {
        return res.status(400).json({ success: false, message: 'Repository URL is required.' });
    }

    // Extract repo name and create a unique folder
    const repoName = repourl.split('/').pop().replace('.git', '');
    const timestamp = Date.now();
    const repoDir = path.join(CLONE_DIR, `${repoName}-${timestamp}`);

    try {
        console.log(`Cloning ${repourl} into ${repoDir}...`);
        await git.clone(repourl, repoDir);

        // Check if repo is a full-stack app
        if (isFullStackApp(repoDir)) {
            const frontendTech = detectFrontendTechnology(repoDir);
            const backendTech = detectBackendTechnology(repoDir);
            const databaseTech = detectDatabase(repoDir);

            // If it's a full-stack app, return detected technologies
            return res.json({
                success: true,
                message: 'Full-stack app detected and cloned successfully!',
                frontend: frontendTech,
                backend: backendTech,
                database: databaseTech
            });

        } else {
            // If it's not a full-stack app, delete it
            deleteRepo(repoDir);
            res.status(400).json({ success: false, message: 'This is not a full-stack app, repository deleted.' });
        }

    } catch (err) {
        console.error('Clone Error:', err);
        return res.status(500).json({
            success: false,
            message: 'Error cloning repository',
            error: err.message
        });
    }
});

// Start the server
const PORT = 5000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
