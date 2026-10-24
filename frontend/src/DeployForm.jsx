import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { GitBranch, Github } from 'lucide-react'; 
import './App.css';

const socket = io('http://localhost:5001', {
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
});

function FloatingGithubIcon({ size, top, left, direction }) {
  return (
    <div
      className={`floating-icon ${direction}`}
      style={{
        width: `${size}px`,
        top: `${top}%`,
        left: `${left}%`,
      }}
    >
      <Github size={size} color="grey" />
    </div>
  );
}

function DeployForm() {
  const [repoUrl, setRepoUrl] = useState('');
  const [disableInput, setDisableInput] = useState(false);
  const [wsMessages, setWsMessages] = useState([]);
  const [showTerminal, setShowTerminal] = useState(false);
  const terminalRef = useRef(null);
  const activeJobIdRef = useRef(null);
  const [floatingIcons, setFloatingIcons] = useState([]);
  const platforms = ["GitHub", "GitLab", "Bitbucket"];
  const [index, setIndex] = useState(0);
  const [fade, setFade] = useState(true);

  useEffect(() => {
    const handleJobStatus = (status) => {
      if (status.jobId !== activeJobIdRef.current) return;
      setWsMessages((messages) => messages.some((message) => (
        message.message === status.message && message.url === status.url
      )) ? messages : [...messages, status]);
      setShowTerminal(true);
    };

    socket.on('job:status', handleJobStatus);
    return () => {
      socket.off('job:status', handleJobStatus);
    };
  }, []);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [wsMessages]);

  useEffect(() => {
    const interval = setInterval(() => {
      setFade(false);

      setTimeout(() => {
        setIndex((prev) => (prev + 1) % platforms.length);
        setFade(true); 
      }, 500);

    }, 4000); 

    return () => clearInterval(interval); // Clean up interval
  }, []);

  // UseEffect to Generation Floating Icons
  useEffect(() => {
    const generateFloatingIcons = () => {
      const icons = [];
      const directions = ['from-top', 'from-bottom', 'from-left', 'from-right'];
      for (let i = 0; i < 50; i++) { // 50 floating icons
        const size = Math.random() * 30 + 11; 
        const top = Math.random() * 100; // Random top position
        const left = Math.random() * 100; // Random left position
        const direction = directions[Math.floor(Math.random() * directions.length)]; // Random direction
        icons.push(<FloatingGithubIcon key={i} size={size} top={top} left={left} direction={direction} />);
      }
      return icons;
    };
  
    setFloatingIcons(generateFloatingIcons());
  }, []);

  const handleClone = async (event) => {
    event.preventDefault();
    const normalizedRepoUrl = repoUrl.trim();
    if (!normalizedRepoUrl || disableInput) return;

    const jobId = window.crypto.randomUUID();
    activeJobIdRef.current = jobId;
    setDisableInput(true);
    setWsMessages([]);
    setShowTerminal(true);

    try {
      await new Promise((resolve, reject) => {
        socket.timeout(5000).emit('join-job', jobId, (error, response) => {
          if (error) {
            reject(new Error('Could not connect to deployment status updates. Please try again.'));
          } else if (!response?.ok) {
            reject(new Error('Could not subscribe to deployment status updates. Please try again.'));
          } else {
            resolve();
          }
        });
      });

      const response = await fetch('http://localhost:5001/api/clone-repo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoUrl: normalizedRepoUrl, jobId }),
      });
      const result = await response.json();

      if (!response.ok || result.status !== 'succeeded') {
        throw new Error(result.error || 'Deployment failed. Please try again.');
      }

      setWsMessages((messages) => {
        const successMessage = 'Deployment completed successfully!';
        const nextMessages = messages.some((message) => message.message === successMessage)
          ? messages
          : [...messages, { jobId, message: successMessage, level: 'success' }];
        return nextMessages.some((message) => message.url === result.deploymentUrl)
          ? nextMessages
          : [...nextMessages, {
            jobId,
            message: 'View deployed app',
            level: 'link',
            url: result.deploymentUrl,
          }];
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Server problem. Please try again.';
      setWsMessages((messages) => messages.some((entry) => entry.level === 'error' && entry.message === message)
        ? messages
        : [...messages, { jobId, message, level: 'error' }]);
    } finally {
      setDisableInput(false);
    }
  };

  const getMessageClass = (message) => {
    if (message.level === 'error') {
      return 'error-message';
    } else if (message.level === 'link') {
      return 'link-message';
    } else {
      return '';
    }
  };



  return (
    <div className='container'>
      {floatingIcons}
      <div className='navbar'>
        <a href="/" className="home-link">GitRepo AutoDeploy App</a>
        <div>
          <a href="https://github.com/BCHAYMAE/deployment_app" target='_blank'>Source Code</a>
          <a href="https://github.com/BCHAYMAE/deployment_app/blob/main/README.md" target='_blank'>How It works?</a>
          
        </div>
      </div>

      <div className="app-container">
        <div className={`input-container ${showTerminal ? 'moved-up' : ''}`}>
          <h1 className="title">
            <img src='./github-logo.png' alt='GitHub Logo' /> 
            Clone a 
            <span className={`platform-name transition-opacity duration-500 ${fade ? "opacity-100" : "opacity-0"}`}>
              {platforms[index]}
            </span> Repo
          </h1>

          <form className="input-box" onSubmit={handleClone}>
            <input
              type="text"
              placeholder="Enter Git Repo URL"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              disabled={disableInput}
              aria-label="Git repository URL"
            />
            <button type="submit" disabled={disableInput || !repoUrl.trim()}>
              <GitBranch className="button-icon" />
              {disableInput ? 'Deploying...' : 'Clone Repo'}
            </button>
          </form>
        </div>

        {showTerminal && (
          <div ref={terminalRef} className={`terminal ${showTerminal ? 'show-terminal' : ''}`}>
            {wsMessages.map((message, index) => (
              <div key={`${message.jobId}-${index}`} className={getMessageClass(message)}>
                {message.url ? (
                  <a href={message.url} target="_blank" rel="noreferrer">{message.message}</a>
                ) : (
                  message.message
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <footer>
            Built by <a target='_blank' href="https://github.com/BCHAYMAE" rel="noreferrer">Chaymae BELLAHCENE</a> || <a target='_blank' href="https://github.com/drawliin" rel="noreferrer">Houssam Eddine HAMOUICH</a>
      </footer>
    </div>
  );
}

export default DeployForm;