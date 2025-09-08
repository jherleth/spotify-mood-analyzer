import { useEffect, useState } from "react";

function App() {
	const [accessToken, setAccessToken] = useState(null);
	const [playlists, setPlaylists] = useState([]);
	const [selectedPlaylist, setSelectedPlaylist] = useState(null);
	const [result, setResult] = useState(null);
	const [loading, setLoading] = useState(false);
	const [tracks, setTracks] = useState([]);

	// parse tokens from URL
	useEffect(() => {
		const params = new URLSearchParams(window.location.search);
		const access = params.get("access_token");
		const refresh = params.get("refresh_token");

		if (access && refresh) {
			localStorage.setItem("access_token", access);
			localStorage.setItem("refresh_token", refresh);
			setAccessToken(access);
			window.history.replaceState({}, document.title, "/");
		} else {
			const storedAccess = localStorage.getItem("access_token");
			if (storedAccess) setAccessToken(storedAccess);
		}
	}, []);

	// fetch playlists
	useEffect(() => {
		if (!accessToken) return;
		const fetchPlaylists = async () => {
			const res = await fetch("https://api.spotify.com/v1/me/playlists", {
				headers: { Authorization: `Bearer ${accessToken}` },
			});
			const data = await res.json();
			if (data.items) setPlaylists(data.items);
		};
		fetchPlaylists();
	}, [accessToken]);

	// analyze playlist
	const analyzePlaylist = async () => {
		if (!selectedPlaylist || !accessToken) return;

		setLoading(true);
		setResult(null);

		try {
			// fetch playlist tracks (for album covers preview)
			const tracksRes = await fetch(
				`https://api.spotify.com/v1/playlists/${selectedPlaylist.id}/tracks`,
				{ headers: { Authorization: `Bearer ${accessToken}` } }
			);
			const tracksData = await tracksRes.json();
			setTracks(tracksData.items || []);

			// call backend for analysis
			const res = await fetch(
				`http://127.0.0.1:8000/api/analyze?playlistID=${selectedPlaylist.id}&access_token=${accessToken}`
			);
			const data = await res.json();
			setResult(data);
		} catch (err) {
			console.error("❌ Error analyzing playlist:", err);
			setResult({ error: "Failed to fetch analysis" });
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="min-h-screen flex justify-center items-center bg-gradient-to-br from-green-500 via-neutral-900 to-black text-white font-sans p-6">
			<div className="bg-neutral-900 p-8 rounded-2xl shadow-2xl w-full max-w-5xl text-center">
				<h1 className="text-4xl font-bold mb-6 flex items-center justify-center gap-2">
					🎧 Spotify Mood Analyzer
				</h1>

				{!accessToken ? (
					<a href="http://127.0.0.1:8000/login">
						<button className="bg-green-500 hover:bg-green-400 transition px-6 py-3 rounded-lg text-lg font-semibold">
							Login with Spotify
						</button>
					</a>
				) : (
					<>
						<p className="mb-6">✅ Logged in with Spotify</p>

						{/* Playlist grid */}
						{playlists.length > 0 && !loading && !result && (
							<div>
								<h2 className="text-xl font-semibold mb-4">Pick a Playlist</h2>
								<div className="grid grid-cols-2 md:grid-cols-4 gap-4">
									{playlists.map((pl) => (
										<div
											key={pl.id}
											onClick={() => setSelectedPlaylist(pl)}
											className={`cursor-pointer rounded-lg overflow-hidden shadow-lg transform hover:scale-105 transition ${
												selectedPlaylist?.id === pl.id
													? "ring-4 ring-green-500"
													: "ring-1 ring-neutral-700"
											}`}
										>
											<img
												src={pl.images?.[0]?.url}
												alt={pl.name}
												className="w-full h-40 object-cover"
											/>
											<div className="bg-neutral-800 p-2 text-sm font-medium truncate">
												{pl.name}
											</div>
										</div>
									))}
								</div>

								{selectedPlaylist && (
									<button
										onClick={analyzePlaylist}
										className="mt-6 bg-green-500 hover:bg-green-400 transition px-6 py-2 rounded-lg font-medium"
									>
										Analyze "{selectedPlaylist.name}"
									</button>
								)}
							</div>
						)}

						{/* loading spinner + album covers */}
						{loading && (
							<div className="mt-6">
								<div className="animate-spin h-12 w-12 border-4 border-white/20 border-t-green-500 rounded-full mx-auto"></div>
								<p className="mt-4">Analyzing "{selectedPlaylist?.name}"...</p>

								{/* album covers preview */}
								<div className="grid grid-cols-5 gap-2 mt-4">
									{tracks.slice(0, 10).map((t, i) => (
										<img
											key={i}
											src={t.track?.album?.images?.[0]?.url}
											alt={t.track?.name}
											className="w-full h-20 object-cover rounded animate-pulse"
										/>
									))}
								</div>
							</div>
						)}

						{/* Results */}
						{result && !result.error && !loading && (
							<div className="mt-8 bg-neutral-800 p-6 rounded-lg text-left">
								<h2 className="text-2xl font-bold mb-4">✨ Playlist Mood</h2>
								<p className="mb-2">
									<strong>Mood:</strong> {result.mood}
								</p>
								<p className="mb-4">
									<strong>AI Description:</strong> {result.aiDescription}
								</p>
								<ul className="space-y-1">
									{result.avgDanceability !== undefined && (
										<li>💃 Danceability: {result.avgDanceability.toFixed(2)}</li>
									)}
									{result.avgMood !== undefined && (
										<li>😊 Mood (happy): {result.avgMood.toFixed(2)}</li>
									)}
									{result.avgTempo !== undefined && (
										<li>🥁 Tempo: {result.avgTempo.toFixed(1)} BPM</li>
									)}
								</ul>
								<button
									onClick={() => {
										setResult(null);
										setSelectedPlaylist(null);
									}}
									className="mt-6 bg-neutral-700 hover:bg-neutral-600 px-4 py-2 rounded-lg"
								>
									🔄 Analyze another playlist
								</button>
							</div>
						)}

						{/* Error state */}
						{result && result.error && !loading && (
							<div className="mt-6 text-red-400 bg-red-900/40 p-4 rounded-lg">
								<h2 className="font-semibold">❌ Error</h2>
								<p>{result.error}</p>
								{result.details && (
									<pre className="whitespace-pre-wrap">{result.details}</pre>
								)}
							</div>
						)}
					</>
				)}
			</div>
		</div>
	);
}

export default App;
