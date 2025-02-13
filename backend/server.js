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
    const requiredFolders = ['frontend', 'backend', 'database']; //  checking frontend & backend & database 
    return requiredFolders.every(folder => fs.existsSync(path.join(repoPath, folder)));
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
    const files = fs.readdirSync(repoPath);
    //check if the backend folder has a package.json (nodejsproject)
    if (fs.existsSync(path.join(repoPath, 'backend', 'package.json'))) return 'nodejs';

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
    //first check for the existing of '.env' file for port config
    const envFilePath = path.join(repoPath, 'backend', '.env');
    if (fs.existsSync(envFilePath)){
        const envContent = fs.readFileSync(envFilePath, 'utf-8');
        //look for port variable in the '.env' file
        const matchPort = envContent.match(/\w*PORT\s*=\s*(\d+)/);
        if(matchPort) 
            return parseInt(matchPort[1], 10); //return port number if found
    }

    // if no '.env' file is found, check for port deff in known backend files
    const portPAtterns = {
        // Node.js typically uses app.listen(PORT)
        'nodejs': /listen\s*\(\s*(\d+)/, 
        // Python Flask apps typically use app.run(port=PORT) 
        'python': /run\(\s*host=.*?,\s*port\s*=\s*(\d+)/, 
        // PHP Laravel config usually specifies port in 'app.php'
        'php': /'port'\s*=>\s*(\d+)/,     
    };

    const filesToCheck = {
        'nodejs' : detectNodeEntryFile(repoPath),
        'python' : detectPython(repoPath),
        'php' : ['config/app.php'], //laravel config file for php
    };
    if(!filesToCheck[technology]) 
        return 'invalid technology';

    //for the given technology, check the corresponding entry files
    for(const file of filesToCheck[technology]){
        const filePath = path.join(repoPath, 'backend', file);
        if (fs.existsSync(filePath)) {
            const content = fs.readFileSync(filePath, 'utf-8');
            //check for port pattern in the file
            const match = content.match(portPAtterns[technology]);
            //return port number if matched
            if(match) 
                return parseInt(match[1], 10);
        }
    }
    //if no port found
    return 'no port found';
    
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

            //check for common database libraries in package.json
            if(packageJson.dependencies) {
                if(packageJson.dependencies['mysql']) return 'mysql';
                if(packageJson.dependencies['pg']) return 'postgres';
                if(packageJson.dependencies['mongodb']) return 'mongodb';
                if(packageJson.dependencies['redis']) return 'redis';
                if(packageJson.dependencies['sqlite3']) return 'squile';
            }
        }
    } else if (backendTech === 'php'){
        //check for database dependencies in php's composer.json
        const composerJsonPath = path.join(repoPath, 'backend', 'composer.json');
        if(fs.existsSync(composerJsonPath)) {
            const composerJson = require(composerJsonPath);
            if(composerJson.require) {
                if (composerJson.require['mysql']) return 'mysql';
                if (composerJson.require['pgsql']) return 'postgres';
            }
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
        const dockerfile = '';

        //check if the frontend tech ids react (or vite),vue or angulair
        if (frontendTech === 'react-vite' || frontendTech === 'react' || frontendTech === 'vue') {
            dockerfile = `
            # Dockerfile for ${frontendTech} application
            # use Node.js as the base img for the build stage
            FROM node:alpine AS build
            
            #set the working directory inside the container
            WORKDIR /app
            
            #install dependencies
            RUN npm install
            
            #copy the entire frontend source code into the container
            COPY ./ ./
            
            #build the angular project
            RUN npm run build 
            
            #use Nginix as the final stage to serve the app
            FROM nginx:alpine
            
            #Copy the compiled output to the Nginx default directory
            COPY --from=build /app/dist/frontend/browser /usr/share/nginx/html
            
            #expose port 80 for http traffic
            EXPOSE 80
            
            #start nginx in foreground mode
            CMD ["nginx", "-g", "daemon off;]
            `;
        }
        //write the generated Dockerfile content into thr frontend directory
        fs.writeFileSync(path.join(repoPath, 'frontend', 'Dockerfile'), dockerfile);
    };

    

// API endpoint to clone a GitHub repo
app.post('/api/clone', async (req, res) => {
    const { repourl } = req.body;

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
            const databaseTech = detectDatabaseTechnology(repoDir);

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
            deleteRepo(CLONE_DIR);
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
