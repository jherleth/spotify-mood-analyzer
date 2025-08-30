import { useEffect, useState } from "react";
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'

function App() {
  const [count, setCount] = useState(0)
  const [accessToken, setAccessToken] = useState(null);

  useEffect(() => {
	const params = new URLSearchParams(window.location.search);
	const token = params.get("access_token");

	if (token) {
		setAccessToken(token);
		localStorage.setItem("spotify_access_token", token);

		window.history.replaceState({}, document.title, "/");
	} else {
		const savedToken = localStorage.getItem("spotify_access_token");
		if (savedToken) {
			setAccessToken(savedToken);
		}
	}
  }, []);

  return (
    <>
      <div>
        <a href="https://vitejs.dev" target="_blank">
          <img src={viteLogo} className="logo" alt="Vite logo" />
        </a>
        <a href="https://react.dev" target="_blank">
          <img src={reactLogo} className="logo react" alt="React logo" />
        </a>
      </div>


      <h1>Spotify Mood Analyzer 🎶</h1>

      {!accessToken ? (
	      <a href="http://127.0.0.1:8000/login">
	      	<button>Login with Spotify</button>
	      </a>
      ) : (
	      <div>
	        <p>Logged in with Spotify!</p>
	        <p>Access Token: {accessToken.substring(0, 15)}...</p>
	      </div>
      )}

      <div className="card">
        <button onClick={() => setCount((count) => count + 1)}>
          count is {count}
        </button>
        <p>
          Edit <code>src/App.jsx</code> and save to test HMR
        </p>
      </div>
      <p className="read-the-docs">
        Click on the Vite and React logos to learn more
      </p>
    </>
  )
}

export default App
