export type ForceId = "blue" | "red";

export interface UnitSummary {
  id: string;
  designation: string;
  type?: string;
  quantity?: number;
}

export interface Force {
  id: ForceId;
  name: string;
  taskForce: string;
  affiliation: "friendly" | "hostile";
  color: string;
  accent: string;
  strength: number;
  ships: UnitSummary[];
  airWing: UnitSummary[];
}

export interface Point {
  x: number;
  y: number;
}

export interface ShipUnit {
  id: string;
  force: ForceId;
  designation: string;
  name: string;
  type: "carrier" | "cruiser" | "destroyer" | "frigate" | "submarine";
  className: string;
  position: Point;
  heading: number;
  speed: number;
  radarRange: number;
  threatRange: number;
  health: number;
}

export interface AircraftUnit {
  id: string;
  force: ForceId;
  callsign: string;
  model: string;
  role: string;
  quantity: number;
  speed: number;
  altitude: number;
  position: Point;
  path: Point[];
}

export interface ScenarioIsland {
  id: string;
  name: string;
  x: number;
  y: number;
  scale: number;
  rotation: number;
}

export interface ScenarioEvent {
  time: string;
  kind: string;
  force: ForceId;
  message: string;
}

export interface Scenario {
  id: string;
  name: string;
  description: string;
  startTime: string;
  durationMinutes: number;
  map: {
    width: number;
    height: number;
    center: Point;
    islands: ScenarioIsland[];
  };
  timeline: ScenarioEvent[];
}

export interface Weather {
  condition: string;
  windKts: number;
  visibility: string;
  seaState: string;
  cloudBaseFt: number;
  pressureMb: number;
  precipitation: string;
  updatedAt: string;
}

export interface SimulationSnapshot {
  time: string;
  elapsedMinutes: number;
  running: boolean;
  speed: number;
  forces: Force[];
  ships: ShipUnit[];
  aircraft: AircraftUnit[];
  events: ScenarioEvent[];
  weather: Weather;
}

export interface DashboardData {
  forces: Force[];
  ships: ShipUnit[];
  aircraft: AircraftUnit[];
  scenarios: Scenario[];
  weather: Weather;
  events: ScenarioEvent[];
}
