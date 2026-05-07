# SkyStrike Architecture

SkyStrike is a full-stack tactical naval-air simulation dashboard. The frontend is intentionally self-sufficient so the first milestone looks and moves like the target command interface even when the APIs or MongoDB are offline.

## Runtime Pieces

- `frontend/`: React, TypeScript, Vite, and Tailwind CSS dashboard. It renders the command UI, animated SVG battle map, overlays, minimap, controls, and event log.
- `server-node/`: Express API for configuration data. It exposes force, scenario, weather, and event endpoints backed by MongoDB when available and JSON seeds otherwise.
- `server-csharp/`: ASP.NET Core simulation engine API. It owns simulation state, start/pause/tick/reset commands, attrition rules, and optional MongoDB snapshot persistence.
- `database/seed/`: JSON source data for forces, ships, aircraft, scenarios, weather, and initial event timeline.
- `firebase.json`: Firebase Hosting configuration for publishing the built Vite app. Firebase Auth is represented by an optional frontend placeholder; MongoDB remains the main database.

## Data Flow

1. The React app calls the Node API endpoints:
   - `GET /api/forces`
   - `GET /api/scenarios`
   - `GET /api/weather`
   - `GET /api/events`
2. The React app also attempts `GET /api/simulation/state` from the C# engine.
3. If either backend is unavailable, the frontend imports the seed JSON directly and continues running.
4. The Node API seeds MongoDB collections on startup if a MongoDB connection exists and the collections are empty.
5. The C# API stores simulation snapshots in MongoDB when a connection exists.

## MongoDB Collections

- `forces`
- `ships`
- `aircraft`
- `scenarios`
- `weather`
- `events`
- `simulationSnapshots`

## Frontend Rendering Strategy

The map is SVG-based rather than image-asset based. This keeps the project free of copyrighted game assets and supports smooth animation of:

- Ship silhouettes by class
- Aircraft silhouettes and contrails
- Curved flight paths
- Radar pulses and range rings
- Red threat zones
- Targeting cones
- Engagement lines and missile sparks
- Island silhouettes and ocean texture filters

The animation loop runs with `requestAnimationFrame`. The frontend uses seeded unit positions and path control points, then derives animated positions each frame.
