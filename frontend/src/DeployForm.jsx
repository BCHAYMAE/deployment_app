"use client";

import { useState, useEffect } from "react";
import { GitBranch, Github } from "lucide-react";
import "./App.css";

// Create a new component for the floating GitHub icon
const FloatingGithubIcon = ({ size, top, left, delay }) => (
  <div
    className="floating-icon"
    style={{
      top: `${top}%`,
      left: `${left}%`,
      animationDelay: `${delay}s`,
    }}
  >
    <Github size={size} />
  </div>
);

function DeployForm() {
  const [repoUrl, setRepoUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState("idle");
  const [statusMessage, setStatusMessage] = useState("");

  const handleClone = async () => {
    if (repoUrl) {
      setIsLoading(true);
      setStatus("loading");
      setStatusMessage("Cloning repository...");
      try {
        const response = await fetch("http://localhost:5001/api/clone-repo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ repoUrl }),
        });
        if (response.ok) {
          setStatus("success");
          setStatusMessage("Repository cloned successfully");
        } else {
          const errorText = await response.text();
          setStatus("error");
          setStatusMessage(`Error: ${errorText}`);
        }
      } catch (error) {
        console.log("Error cloning repo:", error);
        setStatus("error");
        setStatusMessage("Error cloning repository");
      } finally {
        setIsLoading(false);
      }
    }
  };

  // Generate multiple floating icons
  const generateFloatingIcons = () => {
    const icons = [];
    for (let i = 0; i < 50; i++) {
      const size = Math.random() * 40 + 20; // Random size between 20 and 60
      const top = Math.random() * 100; // Random top position
      const left = Math.random() * 100; // Random left position
      const delay = Math.random() * 10; // Random delay between 0 and 10 seconds
      icons.push(<FloatingGithubIcon key={i} size={size} top={top} left={left} delay={delay} />);
    }
    return icons;
  };

  return (
    <div className="deploy-form-container">
      {/* Background with floating GitHub icons */}
      <div className="background-container">
        {generateFloatingIcons()}
      </div>

      {/* Main content */}
      <div className="navbar">
        <nav>Github AutoDeployment App</nav>
        <div className="navbar-links">
          <a href="#source-code">Source Code</a>
          <a href="#operating-process">Operating Process</a>
        </div>
      </div>

      <div className="deploy-form-card">
        <h1 className="deploy-form-title">Clone a GitHub Repository</h1>
        <div className="deploy-form-content">
          <div className="form-group">
            <label htmlFor="repo-url" className="form-label">
              Repository URL
            </label>
            <input
              id="repo-url"
              type="text"
              placeholder="https://github.com/username/repo"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              disabled={isLoading}
              className="form-input"
            />
          </div>
          <button
            onClick={handleClone}
            disabled={isLoading || !repoUrl}
            className="clone-button"
          >
            {isLoading ? (
              <>
                <div className="loader"></div>
                Cloning...
              </>
            ) : (
              <>
                <GitBranch className="button-icon" />
                Clone Repository
              </>
            )}
          </button>
          {status !== "idle" && (
            <div className={`alert ${status}`}>{statusMessage}</div>
          )}
        </div>
      </div>
    </div>
  );
}

export default DeployForm;
