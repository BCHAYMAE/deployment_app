import { useState } from 'react';

function DeployForm() {
    // State to store the URL of the GitHub repository entered by the user
    const [repourl, setRepoUrl] = useState('');
    // State to store the response message from the backend
    const [message, setMessage] = useState('');

    // Handle form submission
    const handleSubmit = async (e) => {
        e.preventDefault(); // Prevent the default form submission

        try {
            // Send a POST request to the backend with the repo URL
            const response = await fetch('http://localhost:5000/api/clone', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ repourl }) // Send the repo URL in the body of the request
            });

            // Get the JSON response from the backend
            const data = await response.json();

            // Handle the response from the backend
            setMessage(data.success ? `Repository cloned successfully: ${data.message}` : data.message || 'Error cloning the repo');
        } catch (error) {
            // Handle any error during the fetch request
            setMessage('Error cloning the repo');
        }
    };

    return (
        <div className="app">
            <h1>Clone a GitHub Repo</h1>
            <form onSubmit={handleSubmit}>
                <label>Enter GitHub Repo URL:</label> <br />
                <input 
                    type="text" 
                    name="repo" 
                    value={repourl} 
                    onChange={(e) => setRepoUrl(e.target.value)}  // Update the repo URL state when the input changes
                /> <br />
                <button type="submit">Clone</button>
            </form>
            <p>{message}</p> {/* Display the response message here */}
        </div>
    );
}

export default DeployForm;