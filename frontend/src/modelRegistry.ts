import type { AircraftUnit, ShipUnit } from "./types";

export type ModelTeam = "blue" | "red";
export type ModelUnitType = "ship" | "aircraft";
export type UnitModelClass = "carrier" | "destroyer" | "battleship" | "submarine" | "fighter" | "helicopter" | "propeller" | "bomber";

export type ModelConfig = {
  modelUrl: string;
  unitType: ModelUnitType;
  scale: number;
  rotationOffset: [number, number, number];
  heightOffset: number;
  headingSign?: 1 | -1;
  headingOffset?: number;
  wakeOffset?: [number, number, number];
};

export const modelRegistry: Record<UnitModelClass, ModelConfig> = {
  carrier: {
    modelUrl: "/models/ships/carrier.glb",
    unitType: "ship",
    scale: 6.5,
    rotationOffset: [-Math.PI / 2, 0, 0],
    heightOffset: 0.58,
    headingSign: 1,
    headingOffset: -Math.PI / 2
  },
  destroyer: {
    modelUrl: "/models/ships/destroyer.glb",
    unitType: "ship",
    scale: 4.25,
    rotationOffset: [-Math.PI / 2, 0, 0],
    heightOffset: 0.48,
    headingSign: 1,
    headingOffset: -Math.PI / 2
  },
  battleship: {
    modelUrl: "/models/ships/battleship.glb",
    unitType: "ship",
    scale: 4.85,
    rotationOffset: [0, 0, 0],
    heightOffset: 0.24,
    headingSign: -1,
    headingOffset: 0
  },
  submarine: {
    modelUrl: "/models/ships/submarine.glb",
    unitType: "ship",
    scale: 3.05,
    rotationOffset: [0, 0, 0],
    heightOffset: 0.04,
    headingSign: -1,
    headingOffset: 0
  },
  fighter: {
    modelUrl: "/models/aircraft/f18.glb",
    unitType: "aircraft",
    scale: 1.22,
    rotationOffset: [0, Math.PI, 0],
    heightOffset: 4.4,
    headingSign: 1,
    headingOffset: -Math.PI / 2
  },
  helicopter: {
    modelUrl: "/models/aircraft/helicopter.glb",
    unitType: "aircraft",
    scale: 1.08,
    rotationOffset: [0, Math.PI, 0],
    heightOffset: 3.4,
    headingSign: 1,
    headingOffset: -Math.PI / 2
  },
  propeller: {
    modelUrl: "/models/aircraft/mustang.glb",
    unitType: "aircraft",
    scale: 1.0,
    rotationOffset: [0, Math.PI, 0],
    heightOffset: 3.9,
    headingSign: 1,
    headingOffset: -Math.PI / 2
  },
  bomber: {
    modelUrl: "/models/aircraft/b17.glb",
    unitType: "aircraft",
    scale: 1.72,
    rotationOffset: [0, Math.PI, 0],
    heightOffset: 4.9,
    headingSign: 1,
    headingOffset: -Math.PI / 2
  }
};

export function getShipModelClass(ship: ShipUnit): UnitModelClass {
  if (ship.type === "carrier") return "carrier";
  if (ship.type === "submarine") return "submarine";
  if (ship.type === "cruiser") return "battleship";
  return "destroyer";
}

export function getAircraftModelClass(flight: AircraftUnit): UnitModelClass {
  const text = `${flight.model} ${flight.role}`.toLowerCase();

  if (text.includes("heli") || text.includes("helicopter") || text.includes("osprey") || text.includes("harbin")) return "helicopter";
  if (text.includes("b-17") || text.includes("b17") || text.includes("wedgetail") || text.includes("hawkeye") || text.includes("sentinel") || text.includes("radar")) return "bomber";
  if (text.includes("mustang") || text.includes("propeller") || text.includes("drone") || text.includes("uav") || text.includes("stingray") || text.includes("sharp")) return "propeller";

  return "fighter";
}

export function preloadModelUrls() {
  return Array.from(new Set(Object.values(modelRegistry).map((model) => model.modelUrl)));
}
