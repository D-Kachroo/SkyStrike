import forcesSeed from "../../../database/seed/forces.json";
import shipsSeed from "../../../database/seed/ships.json";
import aircraftSeed from "../../../database/seed/aircraft.json";
import scenariosSeed from "../../../database/seed/scenarios.json";
import weatherSeed from "../../../database/seed/weather.json";
import type {
  AircraftUnit,
  DashboardData,
  Force,
  Scenario,
  ScenarioEvent,
  ShipUnit,
  SimulationSnapshot,
  Weather
} from "../types";

const browserOrigin = typeof window === "undefined" ? "" : window.location.origin;
const NODE_API = import.meta.env.VITE_NODE_API_URL ?? (import.meta.env.DEV ? "http://localhost:4000" : browserOrigin);
const SIM_API = import.meta.env.VITE_SIM_API_URL ?? (import.meta.env.DEV ? "http://localhost:5000" : browserOrigin);

async function getJson<T>(url: string, fallback: T): Promise<T> {
  try {
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return (await response.json()) as T;
  } catch {
    return fallback;
  }
}

export async function loadDashboardData(): Promise<DashboardData> {
  const scenarioFallback = scenariosSeed as Scenario[];
  const eventsFallback = scenarioFallback[0]?.timeline ?? [];

  const [forces, scenarios, weather, events, simulation] = await Promise.all([
    getJson<Force[]>(`${NODE_API}/api/forces`, forcesSeed as Force[]),
    getJson<Scenario[]>(`${NODE_API}/api/scenarios`, scenarioFallback),
    getJson<Weather>(`${NODE_API}/api/weather`, weatherSeed as Weather),
    getJson<ScenarioEvent[]>(`${NODE_API}/api/events`, eventsFallback),
    getJson<SimulationSnapshot | null>(`${SIM_API}/api/simulation/state`, null)
  ]);

  return {
    forces: forcesSeed as Force[],
    ships: shipsSeed as ShipUnit[],
    aircraft: aircraftSeed as AircraftUnit[],
    scenarios,
    weather,
    events: simulation?.events ?? events
  };
}
