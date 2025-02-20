import React, { useState } from 'react';

function DeployForm() {
  const [repoUrl, setRepoUrl] = useState('');
  const [disableInput, setDisableInput] = useState(false);

  const handleClone = async () => {
    if (repoUrl) {
      setDisableInput(true);
      try {
        await fetch('http://localhost:5001/api/clone-repo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ repoUrl }),
        });
      } catch (error) {
        console.log('Error cloning repo:', error);
        setDisableInput(false);
      }
    }
  };

  return (
    <div className="container">
      <div className="app-container">
        <h1>Clone a GitHub Repo</h1>
        <input
          type="text"
          placeholder="Enter GitHub Repo URL"
          value={repoUrl}
          onChange={(e) => setRepoUrl(e.target.value)}
          disabled={disableInput}
        /> <br/><br/>
        <button onClick={handleClone} disabled={disableInput}>
          Clone Repo
        </button>
      </div>
    </div>
  );
}

export default DeployForm;
