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
- [Docker CLI with Compose v2](https://docs.docker.com/compose/)
- Git CLI
- SSH access from the API host to the provisioned worker

## 🔒 Security boundary and worker setup

Repositories are untrusted code. Dependency installation can run package
scripts, Docker builds execute repository-controlled instructions, and the
application containers run repository code. Deployments are disabled unless a
separate worker is configured. Never point the worker setting at the machine
running this API.

Provision a **dedicated disposable VM with a rootless Docker Engine**, cgroup v2
limits, a quota-limited filesystem, and firewall rules before enabling jobs.
The VM should allow SSH only from the API host and allow deployment traffic only
from its reverse proxy. Restrict outbound traffic at the VM firewall to the
registries needed for image and package downloads. Do not expose the Docker
daemon over an unauthenticated TCP socket. The VM must have enough disk for
image layers and persistent deployment volumes; establish a cleanup/retention
policy for those resources.

Configure the API host with:

```bash
export DEPLOYMENT_WORKER_DOCKER_HOST=ssh://deploy@worker.example.net
export DEPLOYMENT_PUBLIC_BASE_URL=https://apps.example.net
export DEPLOYMENT_WORKSPACE=/srv/deployment-workspace
```

`DEPLOYMENT_WORKSPACE` must be a quota-backed absolute path on the API host.
Mount that same directory at the **same absolute path** on the worker: generated
Compose configuration uses bind mounts for the Nginx config, frontend output,
and database initialization files. The backend shallow-clones repositories
there, accepts only HTTPS URLs whose exact host is `github.com`, `gitlab.com`,
or `bitbucket.org`, enforces 1 GB and 100,000-file checkout limits, and applies
a two-minute clone timeout. The Docker Compose build and run command has a
ten-minute timeout. Compose is invoked with only the generated file (not
repository overrides), and does not load the cloned `.env` file.

Each generated runtime service is limited to 1 CPU, 512 MB memory, and 128
processes; application containers share an internal network with no outbound
route, and database ports are not published. The worker VM's CPU, memory,
process, disk, and egress limits are still essential: Compose runtime limits do
not constrain Docker image builds, and the checkout size check runs after
cloning. Enforce hard CPU, memory, process, disk-quota, and outbound-firewall
limits on the worker and quota the shared workspace before enabling deployments.

The worker reverse proxy should route the HTTPS public URL to
`127.0.0.1:8081` on the worker. Successful deployments persist on the worker;
remove old Compose projects and volumes according to your retention policy.
The backend API itself still binds to loopback and is **not authenticated**.
Do not expose port 5001 to a LAN or the internet, use port forwarding, or change
the backend to listen on `0.0.0.0`. This app is not ready for multi-user or
public service exposure without adding authentication and authorization.

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
