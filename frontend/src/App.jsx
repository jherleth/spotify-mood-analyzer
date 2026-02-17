import { useEffect, useState } from "react";
import MoodRadar from "./components/MoodRadar";

const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

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
				`${API_URL}/api/analyze?playlistID=${selectedPlaylist.id}&access_token=${accessToken}&playlistName=${encodeURIComponent(selectedPlaylist.name)}`
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
		<div className="min-h-screen flex flex-col justify-center items-center text-white font-sans p-6 relative z-0">

			{/* Main Container */}
			<div className="glass-panel w-full max-w-6xl rounded-xl p-8 relative overflow-hidden">

				{/* Decorative decorative glow */}
				<div className="absolute top-0 left-1/2 -translate-x-1/2 w-2/3 h-1 bg-gradient-to-r from-transparent via-[var(--color-cyan)] to-transparent opacity-70 blur-sm"></div>

				<h1 className="text-4xl md:text-6xl font-bold mb-10 text-center uppercase tracking-widest relative z-10">
					<span className="text-[var(--color-neon-pink)] drop-shadow-[0_0_10px_rgba(255,0,127,0.8)]">Mood</span>
					<span className="text-[var(--color-cyan)] drop-shadow-[0_0_10px_rgba(0,243,255,0.8)] ml-4">Analyzer</span>
				</h1>

				{!accessToken ? (
					<div className="flex flex-col items-center justify-center py-20">
						<p className="text-xl mb-8 text-neutral-300 max-w-lg text-center font-light">
							Connect your Spotify account to discover the hidden emotional landscape of your favorite playlists.
						</p>
						<a href={`${API_URL}/login`}>
							<button className="retro-button text-lg px-10 py-4 rounded-full shadow-[0_0_20px_rgba(255,0,127,0.4)]">
								Login with Spotify
							</button>
						</a>
					</div>
				) : (
					<>
						<div className="flex items-center justify-between mb-8 border-b border-white/10 pb-4">
							<p className="text-xl text-[var(--color-cyan)]">Logged in & Ready</p>
							<button
								onClick={() => {
									localStorage.clear();
									window.location.reload();
								}}
								className="text-sm text-neutral-400 hover:text-white underline"
							>
								Logout
							</button>
						</div>

						{/* Playlist grid */}
						{playlists.length > 0 && !loading && !result && (
							<div className="animate-fade-in-up">
								<h2 className="text-2xl mb-6 flex items-center gap-2">
									<span className="w-2 h-8 bg-[var(--color-neon-pink)] rounded-full"></span>
									Select a Playlist
								</h2>
								<div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
									{playlists.map((pl) => (
										<div
											key={pl.id}
											onClick={() => setSelectedPlaylist(pl)}
											className={`group cursor-pointer relative rounded-lg overflow-hidden transition-all duration-300 transform hover:-translate-y-2 ${selectedPlaylist?.id === pl.id
												? "ring-2 ring-[var(--color-cyan)] shadow-[0_0_20px_rgba(0,243,255,0.5)] scale-105"
												: "hover:ring-2 hover:ring-[var(--color-neon-pink)] hover:shadow-[0_0_15px_rgba(255,0,127,0.5)]"
												}`}
										>
											<div className="aspect-square w-full bg-neutral-800 relative">
												{pl.images?.[0]?.url ? (
													<img
														src={pl.images[0].url}
														alt={pl.name}
														className="w-full h-full object-cover group-hover:opacity-80 transition-opacity"
													/>
												) : (
													<div className="w-full h-full flex items-center justify-center text-neutral-600">No Cover</div>
												)}

												{/* Overlay gradient */}
												<div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-3">
													<span className="text-[var(--color-cyan)] text-xs font-bold uppercase tracking-wider">Select</span>
												</div>
											</div>
											<div className="bg-[#150a25] p-3 border-t border-white/5">
												<div className="font-medium truncate text-sm text-neutral-200 group-hover:text-[var(--color-neon-pink)] transition-colors">
													{pl.name}
												</div>
											</div>
										</div>
									))}
								</div>

								{selectedPlaylist && (
									<div className="fixed bottom-10 left-0 right-0 flex justify-center z-50 pointer-events-none">
										<button
											onClick={analyzePlaylist}
											className="retro-button pointer-events-auto shadow-2xl scale-125"
										>
											Analyze "{selectedPlaylist.name}"
										</button>
									</div>
								)}
							</div>
						)}

						{/* loading view */}
						{loading && (
							<div className="flex flex-col items-center justify-center py-20">
								<div className="relative w-24 h-24 mb-8">
									<div className="absolute inset-0 border-4 border-[var(--color-deep-purple)] rounded-full"></div>
									<div className="absolute inset-0 border-4 border-t-[var(--color-neon-pink)] border-r-[var(--color-cyan)] border-b-transparent border-l-transparent rounded-full animate-spin"></div>
									<div className="absolute inset-4 border-4 border-t-transparent border-r-transparent border-b-[var(--color-cyan)] border-l-[var(--color-neon-pink)] rounded-full animate-spin reverse-spin"></div>
								</div>

								<h2 className="text-2xl font-bold animate-pulse text-[var(--color-cyan)]">
									Analyzing Vibes...
								</h2>
								<p className="mt-2 text-neutral-400">Scanning frequency modulation & beat detection</p>

								{/* album covers stream */}
								<div className="w-full overflow-hidden mt-12 relative h-32 mask-linear">
									<div className="flex gap-4 absolute left-1/2 -translate-x-1/2 animate-scroll-left w-max">
										{[...tracks, ...tracks].slice(0, 20).map((t, i) => ( // Duplicate for seamless feel if needed, simplified here
											<img
												key={i}
												src={t.track?.album?.images?.[0]?.url}
												alt=""
												className="w-24 h-24 rounded-md shadow-lg border border-white/10 opacity-70"
											/>
										))}
									</div>
								</div>
							</div>
						)}

						{/* Results */}
						{result && !result.error && !loading && (
							<div className="animate-fade-in mt-6 grid md:grid-cols-2 gap-8 items-start">

								{/* Left Col: Main Mood */}
								<div className="bg-black/30 p-8 rounded-2xl border border-[var(--color-neon-pink)]/30 relative overflow-hidden group">
									<div className="absolute inset-0 bg-[var(--color-neon-pink)]/5 group-hover:bg-[var(--color-neon-pink)]/10 transition-colors"></div>

									<h2 className="text-xl text-[var(--color-text-muted)] uppercase tracking-widest mb-2">Detected Mood</h2>
									<div className="text-5xl md:text-6xl font-bold text-white drop-shadow-[0_0_10px_rgba(255,0,127,0.5)] mb-6">
										{result.mood}
									</div>
									<p className="text-lg leading-relaxed text-neutral-300 border-l-4 border-[var(--color-cyan)] pl-4">
										{result.aiDescription}
									</p>
								</div>

								{/* Right Col: Stats / Radar Chart */}
								<div className="bg-black/30 p-4 rounded-xl border border-white/5 flex flex-col items-center justify-center min-h-[300px]">
									<h3 className="text-[var(--color-cyan)] uppercase tracking-widest text-sm mb-4">Vibe Radar</h3>
									<MoodRadar data={result} />

									<div className="w-full flex justify-between px-4 mt-4 text-xs text-neutral-500 font-mono">
										<span>Tempo: {result.avgTempo?.toFixed(0)} BPM</span>
										<span>{(result.avgDanceability * 100).toFixed(0)}% Dance</span>
									</div>

									<button
										onClick={() => {
											setResult(null);
											setSelectedPlaylist(null);
										}}
										className="w-full mt-6 py-3 rounded-lg border border-white/20 hover:bg-white/5 hover:border-[var(--color-cyan)] hover:text-[var(--color-cyan)] transition-colors uppercase tracking-widest text-sm"
									>
										Analyze Another
									</button>
								</div>
							</div>
						)}

						{/* Error state */}
						{result && result.error && !loading && (
							<div className="mt-6 border border-red-500/50 bg-red-900/20 p-6 rounded-lg text-center">
								<h2 className="text-2xl text-red-400 mb-2 font-bold">System Error</h2>
								<p className="text-neutral-300">{result.error}</p>
							</div>
						)}
					</>
				)}
			</div>

			<footer className="mt-12 text-sm text-neutral-600 font-mono">
				v1.0.0 • Spotify Music Engine
			</footer>
		</div>
	);
}

export default App;
