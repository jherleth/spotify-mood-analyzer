import { useEffect, useState } from "react";

function App() {
  const [accessToken, setAccessToken] = useState(null);
  const [refreshToken, setRefreshToken] = useState(null);
  const [playlists, setPlaylists] = useState([]);
  const [selectedPlaylist, setSelectedPlaylist] = useState("");
  const [result, setResult] = useState(null);

  // parse tokens from URL on first load
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const access = params.get("access_token");
    const refresh = params.get("refresh_token");

    if (access && refresh) {
      localStorage.setItem("access_token", access);
      localStorage.setItem("refresh_token", refresh);
      setAccessToken(access);
      setRefreshToken(refresh);

      // clean up URL
      window.history.replaceState({}, document.title, "/");
    } else {
      const storedAccess = localStorage.getItem("access_token");
      const storedRefresh = localStorage.getItem("refresh_token");
      if (storedAccess && storedRefresh) {
        setAccessToken(storedAccess);
        setRefreshToken(storedRefresh);
      }
    }
  }, []);

  // fetch playlists after login
  useEffect(() => {
    const fetchPlaylists = async () => {
      if (!accessToken) return;
      try {
        const res = await fetch("https://api.spotify.com/v1/me/playlists", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const data = await res.json();
        if (data.items) {
          setPlaylists(data.items);
        }
      } catch (err) {
        console.error("❌ Error fetching playlists:", err);
      }
    };
    fetchPlaylists();
  }, [accessToken]);

  // analyze playlist
  const analyzePlaylist = async () => {
    if (!selectedPlaylist || !accessToken) {
      alert("Select a playlist first!");
      return;
    }

    try {
      const res = await fetch(
        `http://127.0.0.1:8000/api/analyze?playlistID=${selectedPlaylist}&access_token=${accessToken}`
      );
      const data = await res.json();
      setResult(data);
    } catch (err) {
      console.error("❌ Error analyzing playlist:", err);
    }
  };

  return (
    <div style={{ padding: "2rem", fontFamily: "sans-serif" }}>
      <h1>🎧 Spotify Mood Analyzer</h1>

      {!accessToken ? (
        <a href="http://127.0.0.1:8000/login">
          <button>Login with Spotify</button>
        </a>
      ) : (
        <>
          <p>✅ Logged in with Spotify</p>

          {playlists.length > 0 ? (
            <div>
              <h2>Your Playlists</h2>
              <select
                value={selectedPlaylist}
                onChange={(e) => setSelectedPlaylist(e.target.value)}
              >
                <option value="">-- Choose a Playlist --</option>
                {playlists.map((pl) => (
                  <option key={pl.id} value={pl.id}>
                    {pl.name}
                  </option>
                ))}
              </select>
              <button onClick={analyzePlaylist} style={{ marginLeft: "1rem" }}>
                Analyze
              </button>
            </div>
          ) : (
            <p>Loading playlists...</p>
          )}

          {/* Results */}
          {result && !result.error && (
            <div style={{ marginTop: "2rem" }}>
              <h2>Playlist Mood</h2>
              <p>
                <strong>Mood:</strong> {result.mood}
              </p>
              <p>
                <strong>AI Description:</strong> {result.aiDescription}
              </p>
              <ul>
                {result.avgValence !== undefined && (
                  <li>Valence: {result.avgValence.toFixed(2)}</li>
                )}
                {result.avgEnergy !== undefined && (
                  <li>Energy: {result.avgEnergy.toFixed(2)}</li>
                )}
                {result.avgDanceability !== undefined && (
                  <li>Danceability: {result.avgDanceability.toFixed(2)}</li>
                )}
                {result.avgTempo !== undefined && (
                  <li>Tempo: {result.avgTempo.toFixed(1)}</li>
                )}
              </ul>
            </div>
          )}

          {/* Error handling */}
          {result && result.error && (
            <div style={{ marginTop: "2rem", color: "red" }}>
              <h2>❌ Error</h2>
              <p>{result.error}</p>
              {result.details && <pre>{result.details}</pre>}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default App;

