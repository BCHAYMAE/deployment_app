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
- ⚛️ React
- ⚡ React with Vite
- 🖼️ Vue
- 📐 Angular

### Backend
- 🟢 Node.js
- 🐍 Python Flask

### Database
- 🐬 MySQL
- 🐘 PostgreSQL
- 🍃 MongoDB
- 🔴 Redis
- 🗄️ SQLite

## 📦 Prerequisites

Ensure you have the following installed:

- [Node.js](https://nodejs.org/)
- [Docker](https://www.docker.com/)
- [Docker Compose](https://docs.docker.com/compose/)

## ⚙️ Installation

1. **Clone the Repository:**
    ```bash
    git clone <repository-url>
    cd deployment_app
    ```

2. **Install Dependencies:**
    ```bash
    npm install
    ```

3. **Start the Server:**
    ```bash
    node backend/server.js
    ```

## 📡 API Endpoints

### 🚀 Clone and Deploy Repository

- **URL:** `/api/clone-repo`
- **Method:** `POST`
- **Request Body:**
    ```json
    {
      "repoUrl": "https://github.com/user/repo.git"
    }
    ```
- **Responses:**
  - ✅ `200 OK` – Deployment successful.
  - ⚠️ `400 Bad Request` – Repository URL is required.
  - ❌ `404 Not Found` – Repository not found.
  - 💥 `500 Internal Server Error` – Error during deployment.

## 🔄 Workflow

1. **Clone Repository:** The app clones the provided repository into a unique folder.
2. **Technology Detection:** Automatically identifies frontend, backend, and database technologies.
3. **Generate Dockerfiles:** Creates tailored Dockerfiles for each service.
4. **Compose Services:** Builds a `docker-compose.yml` to orchestrate all components.
5. **Build & Deploy:** Uses Docker Compose to build and deploy the stack.
6. **Serve Frontend:** Nginx serves the frontend for efficient delivery.

## ⚠️ Error Handling

- 🛑 **400 Bad Request:** Missing repository URL.
- 🔍 **404 Not Found:** Invalid or non-existent repository.
- 💣 **500 Internal Server Error:** Issues during cloning or deployment, with detailed error messages.

## 📑 Logs

- Real-time logs are printed to the console for debugging and monitoring.

## 📄 License

This project is licensed under the **MIT License**.

