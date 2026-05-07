import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MongoClient } from "mongodb";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const seedDir = path.resolve(__dirname, "../../database/seed");
const frontendDistDir = path.resolve(__dirname, "../../frontend/dist");
const frontendIndexFile = path.join(frontendDistDir, "index.html");
const port = Number(process.env.PORT ?? 4000);
const mongoUri = process.env.MONGODB_URI ?? "mongodb://localhost:27017";
const dbName = process.env.MONGODB_DB ?? "skystrike";

const app = express();
app.use(cors());
app.use(express.json());

let db = null;

async function readSeed(fileName) {
  const file = await readFile(path.join(seedDir, fileName), "utf8");
  return JSON.parse(file);
}

async function loadSeeds() {
  const [forces, ships, aircraft, scenarios, weather] = await Promise.all([
    readSeed("forces.json"),
    readSeed("ships.json"),
    readSeed("aircraft.json"),
    readSeed("scenarios.json"),
    readSeed("weather.json")
  ]);

  return {
    forces,
    ships,
    aircraft,
    scenarios,
    weather,
    events: scenarios[0]?.timeline ?? []
  };
}

const seeds = await loadSeeds();

async function connectMongo() {
  try {
    const client = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 1500 });
    await client.connect();
    db = client.db(dbName);
    await seedMongo();
    console.log(`[skystrike-node] MongoDB connected: ${dbName}`);
  } catch (error) {
    db = null;
    console.warn(`[skystrike-node] MongoDB unavailable, serving JSON seeds: ${error.message}`);
  }
}

async function seedCollection(name, docs) {
  if (!db) return;
  const collection = db.collection(name);
  const count = await collection.estimatedDocumentCount();
  if (count === 0) {
    await collection.insertMany(Array.isArray(docs) ? docs : [{ id: "current", ...docs }]);
  }
}

async function seedMongo() {
  await Promise.all([
    seedCollection("forces", seeds.forces),
    seedCollection("ships", seeds.ships),
    seedCollection("aircraft", seeds.aircraft),
    seedCollection("scenarios", seeds.scenarios),
    seedCollection("weather", seeds.weather),
    seedCollection("events", seeds.events),
    seedCollection("simulationSnapshots", [
      {
        id: "initial",
        createdAt: new Date().toISOString(),
        elapsedMinutes: 42,
        forces: seeds.forces,
        ships: seeds.ships,
        aircraft: seeds.aircraft,
        weather: seeds.weather,
        events: seeds.events
      }
    ])
  ]);
}

function cleanDocument(document) {
  if (!document || typeof document !== "object") return document;
  const { _id, ...rest } = document;
  return rest;
}

async function listOrSeed(collectionName, fallback) {
  if (!db) return fallback;
  const docs = await db.collection(collectionName).find({}).toArray();
  return docs.map(cleanDocument);
}

app.get("/health", (_request, response) => {
  response.json({
    ok: true,
    service: "skystrike-node",
    mongo: Boolean(db)
  });
});

app.get("/api/forces", async (_request, response, next) => {
  try {
    response.json(await listOrSeed("forces", seeds.forces));
  } catch (error) {
    next(error);
  }
});

app.get("/api/scenarios", async (_request, response, next) => {
  try {
    response.json(await listOrSeed("scenarios", seeds.scenarios));
  } catch (error) {
    next(error);
  }
});

app.get("/api/weather", async (_request, response, next) => {
  try {
    if (!db) {
      response.json(seeds.weather);
      return;
    }

    const weather = await db.collection("weather").findOne({ id: "current" });
    response.json(cleanDocument(weather) ?? seeds.weather);
  } catch (error) {
    next(error);
  }
});

app.get("/api/events", async (_request, response, next) => {
  try {
    response.json(await listOrSeed("events", seeds.events));
  } catch (error) {
    next(error);
  }
});

app.use((error, _request, response, _next) => {
  console.error(error);
  response.status(500).json({ error: "SkyStrike API error", detail: error.message });
});

if (existsSync(frontendIndexFile)) {
  app.use(express.static(frontendDistDir));
  app.get(/^(?!\/api(?:\/|$)|\/health$).*/, (_request, response) => {
    response.sendFile(frontendIndexFile);
  });
}

await connectMongo();

const server = app.listen(port, () => {
  console.log(`[skystrike-node] listening on http://localhost:${port}`);
});

process.on("SIGTERM", () => {
  server.close(() => process.exit(0));
});