# Deployment Application

This application automates the process of cloning a repository, detecting its technologies, and deploying it using Docker and Docker Compose.

## 🚀 Features

- 🔗 **Clone Repositories:** Clone any GitHub repository using a provided URL.
- 🔍 **Auto-Detect Technologies:** Identify frontend, backend, and database technologies automatically.
- 🛠 **Auto-Generate Dockerfiles:** Create Dockerfiles for frontend, backend, and database services.
- ⚙️ **Docker Compose Orchestration:** Build and orchestrate services using Docker Compose.
- 🌐 **Frontend with Nginx:** Serve the frontend via Nginx for optimized performance.
- ⚡ **One-Click Deployment:** Fully automate the build and deployment process.

## 📋 Supported Technologies

### Frontend
- React with Vite

### Backend
- Node.js
- Python Flask

### Database
- MySQL
- PostgreSQL
- MongoDB

## 📦 Prerequisites

Ensure you have the following installed:

- [Node.js](https://nodejs.org/)
- [Docker](https://www.docker.com/)
- [Docker Compose](https://docs.docker.com/compose/)

## 🔒 Security boundary

The backend is intended for **single-user local development only**. It binds to
the loopback interface, accepts browser requests only from the local Vite
origins on ports 5173–5175, limits request bodies to 8 KB, allows at most five
deployment requests per minute, and runs one deployment at a time.

This is not user authentication: processes running as your operating-system
user can still access the local service. Do not expose port 5001 to a LAN or the
internet, use port forwarding, or change the backend to listen on `0.0.0.0`.
The service builds and runs code from submitted repositories, so it is not
suitable for multi-user or untrusted public use.

## ⚙️ Installation

1. **Clone the Repository:**
    ```bash
    git clone <repository-url>
    cd deployment_app
    ```

2. **Install backend dependencies & start backend**
    ```bash
    cd backend
    npm install
    node server.js

    ```

3. **Install frontend dependencies & start frontend:**
    ```bash
    cd frontend
    npm install
    npm run dev
    ```

## 🎯 Usage

### 🔹 Deploy a Repository

1. Open the frontend in your browser at http://localhost:5173.
2. Enter your GitHub repository URL in the input field.
3. Click the Clone Repo button.
4. The backend will handle cloning the repository and setting up the deployment.
5. Replace `https://github.com/your-username/your-repo.git` with your repository URL.

## 🧪 Test with Sample Projects (these projects were created by : https://github.com/drawliin )

To quickly test the deployment system, use one of these sample repositories:

1. **React Vite + Node.js + MySQL**  
   🔗 [Fullstack App With NodeJS and MySQL](https://github.com/drawliin/FullStack-React-Node-MySQL.git)  
   ```sh
   https://github.com/drawliin/FullStack-React-Node-MySQL.git
2. **React Vite + NodeJS + PostgreSQL**  
   🔗 [FullStack App With Node and PostgreSQL](https://github.com/drawliin/Fullstack-Node-PostgreSQL.git)  
   ```sh
   https://github.com/drawliin/Fullstack-Node-PostgreSQL.git
   
3. **React CRA + Python Flask + MySQL**  
   🔗 [FullStack App With React (CRA) and FLASK](https://github.com/drawliin/FullStack-ReactCRA-FLASK.git)  
   ```sh
   https://github.com/drawliin/FullStack-ReactCRA-FLASK.git

   
## 📄 License

This project is licensed under the **MIT License**.
