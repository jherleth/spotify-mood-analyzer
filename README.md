# Music Mood Analyzer

[![CI](https://github.com/jherleth/music-mood-analyzer/actions/workflows/ci.yml/badge.svg)](https://github.com/jherleth/music-mood-analyzer/actions/workflows/ci.yml)

A full-stack application that analyzes Spotify playlists to classify their emotional mood. Connects to three external APIs in a multi-stage enrichment pipeline: Spotify (playlist data), MusicBrainz (track identification), and AcousticBrainz (audio feature extraction), then classifies mood using rule-based logic and generates natural language descriptions via Google Gemini. Analysis results are persisted to a local SQLite database for historical insights and CSV export.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Frontend (React + Vite)                      │
│  ┌──────────┐   ┌──────────────┐   ┌──────────┐   ┌────────────────┐  │
│  │  OAuth   │──▶│ Playlist Grid│──▶│ Analysis │──▶│  Radar Chart   │  │
│  │  Login   │   │  Selection   │   │  Loader  │   │  + Results     │  │
│  └──────────┘   └──────────────┘   └──────────┘   └────────────────┘  │
└────────────────────────────┬────────────────────────────────────────────┘
                             │ GET /api/analyze
┌────────────────────────────▼────────────────────────────────────────────┐
│                        Backend (Express)                                │
│                                                                         │
│  ┌─────────────────── Analysis Pipeline ───────────────────────┐       │
│  │                                                              │       │
│  │  Spotify API ──▶ MusicBrainz ──▶ AcousticBrainz ──▶ Gemini │       │
│  │  (tracks)        (MBID lookup)    (audio features)   (AI)    │       │
│  │       │               │                │                     │       │
│  │       └───────── Cache (LRU + TTL) ────┘                     │       │
│  │                                                              │       │
│  │  fetchWithRetry() ── exponential backoff + jitter            │       │
│  └──────────────────────────────────────────────────────────────┘       │
│                             │                                           │
│                     ┌───────▼───────┐                                   │
│                     │    SQLite     │──▶ /api/history                   │
│                     │  (sql.js)    │──▶ /api/insights                  │
│                     │              │──▶ /api/export (CSV)              │
│                     └──────────────┘                                    │
└─────────────────────────────────────────────────────────────────────────┘
```

## Setup

### Prerequisites

- Node.js 20+
- Spotify Developer Account ([dashboard](https://developer.spotify.com/dashboard))

### 1. Clone and install

```bash
git clone https://github.com/jherleth/music-mood-analyzer.git
cd music-mood-analyzer

# Install backend
cd backend && npm install

# Install frontend
cd ../frontend && npm install
```

### 2. Configure environment

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env` with your credentials:

```env
SPOTIFY_CLIENT_ID=your_client_id
SPOTIFY_CLIENT_SECRET=your_client_secret
REDIRECT_URI=http://127.0.0.1:8000/callback
FRONTEND_URI=http://localhost:5173
GEMINI_API_KEY=your_gemini_key    # optional — AI descriptions disabled if missing
```

In your Spotify Developer Dashboard, add `http://127.0.0.1:8000/callback` as a Redirect URI.

### 3. Run

```bash
# Terminal 1: backend
cd backend && npm start

# Terminal 2: frontend
cd frontend && npm run dev
```

Open `http://localhost:5173`, click "Login with Spotify", select a playlist, and analyze.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/analyze?playlistID=...&access_token=...` | Analyze a playlist's mood |
| `GET` | `/api/history` | List past analyses |
| `GET` | `/api/history/:id` | Get analysis detail with per-track breakdown |
| `GET` | `/api/insights` | Aggregate stats across all analyses |
| `GET` | `/api/export` | Download all data as CSV |
| `GET` | `/api/cache/stats` | Cache utilization metrics |
| `GET` | `/health` | Health check |

### Example: Analysis Response

```json
{
  "avgDanceability": 0.72,
  "avgMood": 0.65,
  "avgTempo": 124.5,
  "avgParty": 0.58,
  "avgAggressive": 0.15,
  "mood": "Energetic & Happy",
  "tracksAnalyzed": 18,
  "tracksTotal": 20,
  "aiDescription": "A vibrant, upbeat playlist with strong dance energy...",
  "analysisId": 42,
  "tracks": [
    {
      "trackName": "Blinding Lights",
      "artistName": "The Weeknd",
      "isrc": "USUG11904190",
      "mbid": "f3e7b5c2-...",
      "danceability": 0.51,
      "mood": 0.82,
      "tempo": 171,
      "party": 0.65,
      "aggressive": 0.08,
      "hasFeatures": true
    }
  ]
}
```

### Example: Insights Response

```json
{
  "totalAnalyses": 47,
  "totalTracks": 892,
  "moodDistribution": [
    { "mood": "Energetic & Happy", "count": 14 },
    { "mood": "Calm & Reflective", "count": 11 },
    { "mood": "Chill & Atmospheric", "count": 8 }
  ],
  "globalAverages": {
    "danceability": 0.58,
    "mood": 0.52,
    "tempo": 118.3,
    "party": 0.44,
    "aggressive": 0.21
  }
}
```

## Testing

```bash
cd backend

# Run tests
npm test

# Run with coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

**Test coverage:** 32 tests across 4 suites:
- `classify.test.js` — mood classification edge cases, priority ordering, multi-track averaging
- `cache.test.js` — TTL expiration, LRU eviction, cache-through helper
- `http.test.js` — exponential backoff calculation, Retry-After header parsing
- `analyze.integration.test.js` — full endpoint test with mocked Spotify/MusicBrainz/AcousticBrainz/Gemini

## Linting

```bash
cd backend && npm run lint
cd frontend && npm run lint
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite 7, TailwindCSS, Recharts |
| Backend | Node.js, Express 5 |
| Database | SQLite (sql.js / WebAssembly) |
| APIs | Spotify Web API, MusicBrainz, AcousticBrainz, Google Gemini |
| Testing | Jest, Supertest |
| CI | GitHub Actions (Node 20/22) |

## Future Work

- Token refresh middleware (auto-refresh expired Spotify tokens)
- Playlist comparison mode (diff two playlists' mood profiles)
- WebSocket progress updates during long analyses
- Docker Compose for one-command dev environment
