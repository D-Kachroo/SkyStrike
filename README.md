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
