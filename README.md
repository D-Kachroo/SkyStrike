# SkyStrike

SkyStrike is a full-stack tactical naval-air simulation dashboard with a dark military UI, animated ocean combat map, blue/red force panels, radar overlays, threat zones, minimap, weather, camera controls, view toggles, and event log.

## Stack

- Frontend: React + TypeScript + Vite + Tailwind CSS
- Backend 1: Node.js + Express API
- Backend 2: C# ASP.NET Core simulation API
- Database: MongoDB
- Data/config: JSON seed files
- Hosting: Firebase Hosting config with optional Firebase Auth placeholder

## Project Structure

```text
skystrike/
  frontend/
  server-node/
  server-csharp/
  database/
    seed/
      forces.json
      ships.json
      aircraft.json
      scenarios.json
      weather.json
  docs/
    architecture.md
    simulation-rules.md
  README.md
```

## Quick Start

Install Node dependencies:

```bash
cd skystrike
npm install
```

Run the frontend:

```bash
npm run dev:frontend
```

Run the Node API:

```bash
npm run dev:node
```

Optional MongoDB:

```bash
docker compose up -d mongo
```

Run the C# simulation API:

```bash
cd server-csharp
dotnet restore
dotnet run
```

Default URLs:

- Frontend: `http://localhost:5173`
- Node API: `http://localhost:4000`
- C# simulation API: `http://localhost:5000`
- MongoDB: `mongodb://localhost:27017`

## API Endpoints

Node/Express:

- `GET /api/forces`
- `GET /api/scenarios`
- `GET /api/weather`
- `GET /api/events`

C# ASP.NET Core:

- `GET /api/simulation/state`
- `POST /api/simulation/start`
- `POST /api/simulation/pause`
- `POST /api/simulation/tick`
- `POST /api/simulation/reset`

## Render Deployment

SkyStrike can be deployed to Render as a single Node web service, following the same overall pattern as AlphaGreeks+. The Node service serves the built Vite frontend and the Express API from one Render app.

Render uses:

```bash
npm install && npm run build:frontend
npm run start:node
```

Set these environment variables in Render:

```bash
NODE_ENV=production
MONGODB_URI=your_mongodb_connection_string
MONGODB_DB=skystrike
```

Notes:

- The frontend uses same-origin API requests in production, so no extra frontend API URL is required for the Node service.
- If MongoDB is unavailable, the Node API falls back to the JSON seed data automatically.
- The C# simulation API remains optional for this Render deployment path because the dashboard already has frontend fallbacks.

## Firebase

Firebase Hosting is configured in `firebase.json` to serve `frontend/dist`.

Build and deploy:

```bash
npm run build:frontend
firebase deploy
```

The frontend includes `src/services/firebase.ts` as an optional Firebase Auth placeholder. Add values to `frontend/.env` when Firebase Auth is needed. MongoDB remains the main application database.