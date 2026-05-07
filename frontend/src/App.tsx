import {
  Activity,
  AlertTriangle,
  Anchor,
  ClipboardList,
  Compass,
  Crosshair,
  Cpu,
  FileText,
  Gauge,
  Headphones,
  HelpCircle,
  LocateFixed,
  LogOut,
  MapIcon,
  Pause,
  Plane,
  Play,
  Power,
  Radio,
  Radar,
  RotateCcw,
  RotateCw,
  Satellite,
  Settings,
  Shield,
  ShieldCheck,
  Ship as ShipIcon,
  SlidersHorizontal,
  Target,
  TimerReset,
  Wrench,
  X,
  ZoomIn,
  ZoomOut
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode, type WheelEvent as ReactWheelEvent } from "react";
import { loadDashboardData } from "./services/api";
import type {
  AircraftUnit,
  DashboardData,
  Force,
  ForceId,
  Point,
  ScenarioEvent,
  ScenarioIsland,
  ShipUnit
} from "./types";

type ViewOptions = {
  radar: boolean;
  rangeRings: boolean;
  waypoints: boolean;
  threatZones: boolean;
  labels: boolean;
};

type CameraMode = "2d" | "3d";
type CameraLock = "follow" | "free";
type ActiveTab = "Mission" | "Setup" | "Simulation" | "Results";
type ModalKind = "help" | "settings" | "exit" | null;

type CameraState = {
  zoom: number;
  panX: number;
  panY: number;
  yaw: number;
  pitch: number;
};

type CameraDrag = {
  x: number;
  y: number;
  panX: number;
  panY: number;
  yaw: number;
  pitch: number;
  mode: "pan" | "rotate";
};

type MissionSettings = {
  name: string;
  patrolRadius: number;
  engagementRange: number;
  launchDelay: number;
  intent: string;
};

type FleetSettings = {
  fighterFlights: number;
  strikeJets: number;
  missileReserve: number;
  screenSpacing: number;
};

const forceTint: Record<ForceId, { line: string; glow: string; fill: string }> = {
  blue: { line: "#38d5ff", glow: "rgba(56, 213, 255, 0.45)", fill: "rgba(56, 213, 255, 0.14)" },
  red: { line: "#fa3c2c", glow: "rgba(255, 91, 67, 0.42)", fill: "rgba(255, 107, 74, 0.13)" }
};

const tabLabels: ActiveTab[] = ["Mission", "Setup", "Simulation", "Results"];

const initialCamera: CameraState = {
  zoom: 1,
  panX: 0,
  panY: 0,
  yaw: 0,
  pitch: 8
};

const missionObjectives = [
  "Find the opposing carrier group before they can launch a second wave",
  "Keep a radar plane watching the island chain and open ocean lanes",
  "Protect the carrier while preserving enough jets for follow-up strikes"
];

const fleetActions = ["Wide protective spread", "Guard the carrier", "Launch aircraft first", "Submarine scouting"] as const;

const initialMissionSettings: MissionSettings = {
  name: "Island Shield",
  patrolRadius: 155,
  engagementRange: 82,
  launchDelay: 4,
  intent: "Scout wide, keep fighters near the carrier, and only push forward when the route is clear."
};

const initialFleetSettings: FleetSettings = {
  fighterFlights: 5,
  strikeJets: 14,
  missileReserve: 72,
  screenSpacing: 30
};

const viewLabels: Array<{ key: keyof ViewOptions; label: string }> = [
  { key: "radar", label: "Radar" },
  { key: "rangeRings", label: "Range Rings" },
  { key: "waypoints", label: "Routes" },
  { key: "threatZones", label: "Danger Zones" },
  { key: "labels", label: "Labels" }
];

const referenceIslands: ScenarioIsland[] = [
  { id: "northwest-island", name: "Northwest Island", x: 17, y: 13, scale: 0.5, rotation: -16 },
  { id: "northeast-island", name: "Northeast Island", x: 83, y: 15, scale: 0.43, rotation: 12 },
  { id: "central-island", name: "Central Island", x: 51, y: 47, scale: 0.72, rotation: 6 },
  { id: "south-island", name: "South Island", x: 50, y: 96, scale: 0.54, rotation: -8 }
];

function timeToMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return (hours - 8) * 60 + minutes;
}

function formatMissionTime(minutes: number) {
  const totalSeconds = Math.floor(minutes * 60);
  const hour = 8 + Math.floor(totalSeconds / 3600);
  const minute = Math.floor((totalSeconds % 3600) / 60);
  const second = totalSeconds % 60;
  return `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}:${second.toString().padStart(2, "0")}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function mapPoint(point: Point): Point {
  return { x: point.x, y: point.y * 0.5625 };
}

function cubicAt(points: Point[], t: number): Point {
  if (points.length < 4) return mapPoint(points[0] ?? { x: 50, y: 50 });
  const [p0, p1, p2, p3] = points.map(mapPoint);
  const inv = 1 - t;
  return {
    x: inv ** 3 * p0.x + 3 * inv ** 2 * t * p1.x + 3 * inv * t ** 2 * p2.x + t ** 3 * p3.x,
    y: inv ** 3 * p0.y + 3 * inv ** 2 * t * p1.y + 3 * inv * t ** 2 * p2.y + t ** 3 * p3.y
  };
}

function pathHeading(points: Point[], t: number) {
  const a = cubicAt(points, clamp(t - 0.01, 0, 1));
  const b = cubicAt(points, clamp(t + 0.01, 0, 1));
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
}

function curvePath(points: Point[]) {
  if (points.length < 4) return "";
  const [p0, p1, p2, p3] = points.map(mapPoint);
  return `M ${p0.x} ${p0.y} C ${p1.x} ${p1.y}, ${p2.x} ${p2.y}, ${p3.x} ${p3.y}`;
}

function curveViewPath(points: Point[]) {
  if (points.length < 4) return "";
  const [p0, p1, p2, p3] = points;
  return `M ${p0.x} ${p0.y} C ${p1.x} ${p1.y}, ${p2.x} ${p2.y}, ${p3.x} ${p3.y}`;
}

function routePath(points: Point[], origin?: Point) {
  if (points.length < 4) return "";
  const mapped = points.map(mapPoint);
  if (origin) mapped[0] = origin;
  return curveViewPath(mapped);
}

function shipFormationAnchor(ship: ShipUnit): Point {
  const sideAnchors: Record<ForceId, Record<ShipUnit["type"], Point>> = {
    blue: {
      carrier: { x: 11.5, y: 43 },
      cruiser: { x: 27.5, y: 21 },
      destroyer: { x: 11.5, y: 70 },
      frigate: { x: 16.5, y: 82 },
      submarine: { x: 20.5, y: 60 }
    },
    red: {
      carrier: { x: 88.5, y: 43 },
      cruiser: { x: 76, y: 24 },
      destroyer: { x: 85, y: 66 },
      frigate: { x: 90, y: 80 },
      submarine: { x: 75.5, y: 57 }
    }
  };

  return sideAnchors[ship.force][ship.type];
}

function inwardTarget(ship: ShipUnit): Point {
  const centerTargets: Record<ForceId, Record<ShipUnit["type"], Point>> = {
    blue: {
      carrier: { x: 11.5, y: 43 },
      cruiser: { x: 40, y: 22 },
      destroyer: { x: 35, y: 68 },
      frigate: { x: 47, y: 77 },
      submarine: { x: 36, y: 59 }
    },
    red: {
      carrier: { x: 88.5, y: 43 },
      cruiser: { x: 61, y: 25 },
      destroyer: { x: 69, y: 64 },
      frigate: { x: 53, y: 77 },
      submarine: { x: 63, y: 57 }
    }
  };

  return centerTargets[ship.force][ship.type];
}

function keepShipsClearOfIslands(point: Point, ship: ShipUnit): Point {
  const protectedZones = [
    { x: 17, y: 13, rx: 9.6, ry: 8.3 },
    { x: 83, y: 15, rx: 8.8, ry: 7.6 },
    { x: 51, y: 47, rx: 17.8, ry: 14.8 },
    { x: 50, y: 96, rx: 11.6, ry: 8.2 }
  ];
  let adjusted = { ...point };

  for (const zone of protectedZones) {
    const dx = adjusted.x - zone.x;
    const dy = adjusted.y - zone.y;
    const distance = Math.sqrt((dx / zone.rx) ** 2 + (dy / zone.ry) ** 2);
    if (distance >= 1) continue;

    const fallback = ship.force === "blue" ? -0.01 : 0.01;
    const angle = Math.atan2(dy / zone.ry, dx / zone.rx || fallback);
    adjusted.x = zone.x + Math.cos(angle) * zone.rx;
    adjusted.y = zone.y + Math.sin(angle) * zone.ry;
  }

  return adjusted;
}

function shipState(ship: ShipUnit, simMinutes: number, index: number, fleetSettings: FleetSettings = initialFleetSettings, fleetPosture: (typeof fleetActions)[number] = "Wide protective spread") {
  const elapsed = Math.max(0, simMinutes - 42);
  const start = shipFormationAnchor(ship);
  const target = inwardTarget(ship);
  const posturePace = fleetPosture === "Launch aircraft first" ? 0.9 : fleetPosture === "Guard the carrier" ? 0.55 : 1;
  const spacingPace = clamp(fleetSettings.screenSpacing / 30, 0.75, 1.35);
  const maxApproach = ship.type === "carrier" ? 0 : ship.type === "frigate" ? 0.92 : ship.force === "red" ? 0.5 : 0.58;
  const movementRates: Record<ShipUnit["type"], number> = {
    carrier: 0,
    cruiser: 1.08,
    destroyer: 0.95,
    frigate: 2.25,
    submarine: 0.84
  };
  const approach = clamp(elapsed * 0.04 * posturePace * spacingPace * movementRates[ship.type], 0, maxApproach);
  const rawPoint = keepShipsClearOfIslands({
    x: clamp(start.x + (target.x - start.x) * approach, 5, 95),
    y: clamp(start.y + (target.y - start.y) * approach, 9, 91)
  }, ship);
  const heading = ship.force === "blue" ? 0 : 180;

  return {
    point: mapPoint(rawPoint),
    heading
  };
}

function visualAircraftCopies(flight: AircraftUnit, fleetSettings: FleetSettings) {
  const role = `${flight.model} ${flight.role}`.toLowerCase();
  if (flight.id === "blue-flight-mq9b" || flight.id === "red-flight-orion") return 1;
  if (role.includes("radar") || role.includes("blackbird") || role.includes("scouting")) return 1;
  if (flight.force === "red") return role.includes("strike") || role.includes("interceptor") ? 2 : 1;
  const groupInfluence = Math.ceil(fleetSettings.fighterFlights / 2.5);
  const jetInfluence = Math.ceil(fleetSettings.strikeJets / 8);
  return clamp(Math.max(groupInfluence, jetInfluence, 2) + 1, 3, 5);
}

function formationPoint(point: Point, heading: number, copy: number, copies: number): Point {
  if (copies <= 1) return point;
  const lane = copy - (copies - 1) / 2;
  const weave = Math.sin(copy * 1.7 + copies * 0.43) * 0.78;
  const spread = lane * 5.8 + weave * 1.2;
  const stagger = lane * 2.1 + copy * 1.35;
  const radians = (heading * Math.PI) / 180;
  return {
    x: point.x + Math.cos(radians + Math.PI / 2) * spread - Math.cos(radians) * stagger,
    y: point.y + Math.sin(radians + Math.PI / 2) * spread - Math.sin(radians) * stagger
  };
}

function adjustedAircraftPath(flight: AircraftUnit, missionSettings: MissionSettings, fleetSettings: FleetSettings, fleetPosture: (typeof fleetActions)[number]) {
  const patrolShift = clamp((missionSettings.patrolRadius - 155) * 0.035, -4, 4);
  const safeShift = clamp((missionSettings.engagementRange - 82) * 0.04, -3.5, 3.5);
  const screenShift = clamp((fleetSettings.screenSpacing - 30) * 0.05, -3, 3);
  const strikePush = clamp((fleetSettings.strikeJets - 14) * 0.12, -2.5, 3.2);
  const postureLift = fleetPosture === "Launch aircraft first" ? -1.4 : fleetPosture === "Guard the carrier" ? 1.4 : 0;

  const paths: Record<string, Point[]> = {
    "blue-flight-fa18e": [
      { x: 19.5, y: 37 },
      { x: 38 + strikePush, y: 21 - postureLift * 0.35 },
      { x: 60, y: 23 - patrolShift * 0.18 },
      { x: 76 - safeShift * 0.35, y: 24 }
    ],
    "blue-flight-fa18e-cover": [
      { x: 22, y: 63 },
      { x: 41, y: 56 + screenShift * 0.25 },
      { x: 66 + strikePush * 0.2, y: 50 + patrolShift * 0.16 },
      { x: 88.5 - safeShift * 0.2, y: 43 }
    ],
    "blue-flight-e2d": [
      { x: 31, y: 18 },
      { x: 42, y: 14 - patrolShift * 0.16 },
      { x: 58, y: 18 - patrolShift * 0.12 },
      { x: 76 - safeShift * 0.2, y: 24 }
    ],
    "blue-flight-mq9b": [
      { x: 16.5, y: 82 },
      { x: 39, y: 70 + patrolShift * 0.16 },
      { x: 59 + strikePush * 0.2, y: 65 + patrolShift * 0.12 },
      { x: 75.5 - safeShift * 0.3, y: 57 }
    ],
    "red-flight-su33": [
      { x: 80.5, y: 37 },
      { x: 62 - strikePush, y: 22 - postureLift * 0.25 },
      { x: 41, y: 24 - patrolShift * 0.15 },
      { x: 27.5 + safeShift * 0.35, y: 21.5 }
    ],
    "red-flight-su33-strike": [
      { x: 82, y: 63 },
      { x: 64, y: 57 + screenShift * 0.22 },
      { x: 42 - strikePush * 0.2, y: 54 + patrolShift * 0.16 },
      { x: 11.5 + safeShift * 0.2, y: 43 }
    ],
    "red-flight-ka31": [
      { x: 69, y: 18 },
      { x: 58, y: 15 - patrolShift * 0.12 },
      { x: 43, y: 19 - patrolShift * 0.12 },
      { x: 27.5 + safeShift * 0.2, y: 21 }
    ],
    "red-flight-orion": [
      { x: 90, y: 80 },
      { x: 62, y: 70 + screenShift * 0.14 },
      { x: 42 - strikePush * 0.2, y: 64 + patrolShift * 0.12 },
      { x: 20.5 + safeShift * 0.3, y: 60 }
    ]
  };

  return paths[flight.id] ?? flight.path;
}

function aircraftPhase(flight: AircraftUnit, index: number, simMinutes: number, missionSettings: MissionSettings, fleetSettings: FleetSettings) {
  const delay = missionSettings.launchDelay * 0.007;
  const coverBoost = clamp(fleetSettings.fighterFlights / 5, 0.75, 1.35);
  const phaseOffsets: Record<string, number> = {
    "blue-flight-fa18e": 0.02,
    "blue-flight-e2d": 0.24,
    "blue-flight-fa18e-cover": 0.48,
    "blue-flight-mq9b": 0.72,
    "red-flight-su33": 0.08,
    "red-flight-ka31": 0.31,
    "red-flight-su33-strike": 0.55,
    "red-flight-orion": 0.78
  };
  return (Math.max(0, simMinutes - 42) * 0.0395 * flight.speed * coverBoost + (phaseOffsets[flight.id] ?? index * 0.18) - delay) % 1;
}

function missionRingScale(value: number, divisor: number, min: number, max: number) {
  return clamp(value / divisor, min, max);
}

function strengthFor(force: Force, simMinutes: number) {
  const attrition = force.id === "blue" ? (simMinutes > 46 ? 2 : simMinutes > 43 ? 1 : 0) : simMinutes > 46 ? 4 : simMinutes > 43 ? 2 : 0;
  return clamp(force.strength - attrition, 0, 100);
}

function friendlyShipName(designation: string, type?: string) {
  const titleByDesignation: Record<string, string> = {
    "CVN-78": "USS Gerald Ford (CVN-78)",
    "CG-67": "USS Shiloh (CG-67)",
    "DDG-101": "USS Gridley (DDG-101)",
    "FFG-62": "USS Constellation (FFG-62)",
    "SSN-774": "USS Ohio (SSBN-726)",
    "CVN-76": "USS Ronald Reagan (CVN-76)",
    "CG-68": "USS Anzio (CG-68)",
    "DDG-102": "USS Sampson (DDG-102)",
    "FFG-61": "USS Ingraham (FFG-61)",
    "SSN-773": "USS Maine (SSBN-741)",
    "CVN-91": "CVN-91 Horizon",
    "CG-72": "CG-72 Sentinel",
    "DDG-118": "DDG-118 Archer",
    "DDG-125": "DDG-125 Ranger",
    "FFG-88": "FFG-88 Marlin",
    "FFG-97": "FFG-97 Pike",
    "SSN-802": "SSN-802 Phantom",
    "CVN-84": "CVN-84 Vostok",
    "CG-79": "CG-79 Dragun",
    "DDG-127": "DDG-127 Vulkan",
    "DDG-136": "DDG-136 Sokol",
    "FFG-93": "FFG-93 Volna",
    "FFG-102": "FFG-102 Moroz",
    "SSN-821": "SSN-821 Akula"
  };

  if (designation.includes("Gerald R. Ford")) return "USS Gerald Ford (CVN-78)";
  return titleByDesignation[designation] ?? designation ?? type ?? "Unit";
}

function friendlyShipDetail(_designation: string, _type?: string) {
  return "";
}

function mapShipLabel(ship: ShipUnit) {
  return friendlyShipName(ship.designation, ship.className);
}

function friendlyAircraftName(name: string) {
  if (name.includes("SR-71") || name.includes("Blackbird")) return "SR-71 Blackbird";
  if (name.includes("F/A-18") || name.includes("Super Hornet")) return "F/A-18E Super Hornet";
  if (name.includes("F-35") || name.includes("Lightning")) return "F-35 Lightning II";
  if (name.includes("E-2D") || name.includes("Hawkeye")) return "E-2D Hawkeye";
  if (name.includes("E-7") || name.includes("Wedgetail")) return "E-7 Wedgetail";
  if (name.includes("MH-60R") || name.includes("Seahawk")) return "MH-60R Seahawk";
  if (name.includes("V-22") || name.includes("Osprey")) return "V-22 Osprey";
  if (name.includes("MQ-9B") || name.includes("SeaGuardian")) return "MQ-9B SeaGuardian";
  if (name.includes("MQ-25") || name.includes("Stingray")) return "MQ-25 Stingray";
  if (name.includes("Su-33") || name.includes("Flanker")) return "Su-33 Flanker";
  if (name.includes("J-20") || name.includes("Dragon")) return "J-20 Dragon";
  if (name.includes("Su-57") || name.includes("Felon")) return "Su-57 Felon";
  if (name.includes("KJ-600") || name.includes("Sentinel")) return "KJ-600 Sentinel";
  if (name.includes("Ka-31")) return "Ka-31 Helix";
  if (name.includes("Ka-27")) return "Ka-27 Helix";
  if (name.includes("Z-20") || name.includes("Harbin")) return "Z-20 Harbin";
  if (name.includes("Orion")) return "Orion UAV";
  if (name.includes("GJ-11") || name.includes("Sharp")) return "GJ-11 Sharp";
  return name;
}

function mapAircraftLabel(name: string) {
  return friendlyAircraftName(name);
}

function friendlyAirRole(role: string) {
  const normalized = role.toLowerCase();
  if (normalized.includes("early") || normalized.includes("radar")) return "radar";
  if (normalized.includes("scout")) return "scout";
  if (normalized.includes("cap")) return "cover";
  if (normalized.includes("interceptor")) return "intercept";
  if (normalized.includes("strike")) return "strike";
  return role.toLowerCase();
}

function shipBadge(type?: string) {
  const text = (type ?? "").toLowerCase();
  if (text.includes("carrier") || text.includes("cvn")) return "CARRIER";
  if (text.includes("cruiser") || text.includes("cg")) return "CRUISER";
  if (text.includes("destroyer") || text.includes("ddg")) return "DESTROYER";
  if (text.includes("frigate") || text.includes("ffg")) return "FRIGATE";
  if (text.includes("submarine") || text.includes("ssn")) return "SUB";
  return "SHIP";
}

function shipKindFromSummary(designation: string, type?: string): ShipUnit["type"] {
  const text = `${designation} ${type ?? ""}`.toLowerCase();
  if (text.includes("carrier") || text.includes("cvn")) return "carrier";
  if (text.includes("cruiser") || text.includes("cg")) return "cruiser";
  if (text.includes("destroyer") || text.includes("ddg")) return "destroyer";
  if (text.includes("frigate") || text.includes("ffg")) return "frigate";
  return "submarine";
}

function aircraftBadge(name: string) {
  const friendly = friendlyAircraftName(name);
  if (friendly.includes("Blackbird")) return "RECON";
  if (friendly.includes("Lightning") || friendly.includes("Dragon") || friendly.includes("Hornet") || friendly.includes("Felon") || friendly.includes("Flanker")) return "JET";
  if (friendly.includes("Hawkeye") || friendly.includes("Wedgetail") || friendly.includes("Sentinel")) return "RADAR";
  if (friendly.includes("Seahawk") || friendly.includes("Helix") || friendly.includes("Osprey") || friendly.includes("Harbin")) return "LIFT";
  if (friendly.includes("SeaGuardian") || friendly.includes("Orion") || friendly.includes("Stingray") || friendly.includes("Sharp")) return "DRONE";
  return "AIR";
}

function friendlyEventMessage(message: string) {
  return message
    .replace(/F-35C/g, "F-35 Lightning II")
    .replace(/E-7 Wedgetail/g, "E-7 Wedgetail")
    .replace(/MQ-9B SeaGuardian locked on target/g, "SR-71 Blackbird confirmed target track")
    .replace(/MQ-9B locked on target/g, "SR-71 Blackbird confirmed target track")
    .replace(/MQ-9B/g, "SR-71 Blackbird")
    .replace(/USS Gerald R\. Ford/g, "USS Gerald Ford (CVN-78)")
    .replace(/USS Gerald Ford \(USS Gerald Ford \(CVN-78\)\)/g, "USS Gerald Ford (CVN-78)")
    .replace(/from CVN-78/g, "from USS Gerald Ford (CVN-78)")
    .replace(/CG-67/g, "USS Shiloh (CG-67)")
    .replace(/Ka-31 Helix/g, "F-35 Lightning II")
    .replace(/MQ-25/g, "MQ-25 Stingray")
    .replace(/CG-72/g, "CG-72 Sentinel")
    .replace(/CG-79/g, "CG-79 Dragun")
    .replace(/CVN-91/g, "CVN-91 Horizon")
    .replace(/CVN-84/g, "CVN-84 Vostok")
    .replace(/Enemy/g, "Opponent")
    .replace(/enemy/g, "opponent")
    .replace(/Red task force/g, "Opponent fleet")
    .replace(/layered defense/g, "protective screen");
}

function App() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>("Simulation");
  const [modal, setModal] = useState<ModalKind>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [speed, setSpeed] = useState(2);
  const [simMinutes, setSimMinutes] = useState(42);
  const [fleetPosture, setFleetPosture] = useState<(typeof fleetActions)[number]>("Wide protective spread");
  const [missionSettings, setMissionSettings] = useState<MissionSettings>(initialMissionSettings);
  const [fleetSettings, setFleetSettings] = useState<FleetSettings>(initialFleetSettings);
  const [commandFeed, setCommandFeed] = useState<string[]>([
    "08:42:00 Shared map connected with Blue Fleet",
    "08:42:00 Launch approval remains with the player"
  ]);
  const [viewOptions, setViewOptions] = useState<ViewOptions>({
    radar: true,
    rangeRings: true,
    waypoints: true,
    threatZones: true,
    labels: false
  });
  const [cameraMode, setCameraMode] = useState<CameraMode>("3d");
  const [cameraLock, setCameraLock] = useState<CameraLock>("follow");
  const [camera, setCamera] = useState<CameraState>(initialCamera);
  const animationFrameRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number | null>(null);
  useEffect(() => {
    loadDashboardData().then(setData);
  }, []);

  useEffect(() => {
    if (!isPlaying) {
      lastFrameRef.current = null;
      return undefined;
    }

    const tick = (timestamp: number) => {
      const previousTimestamp = lastFrameRef.current ?? timestamp;
      const deltaSeconds = clamp((timestamp - previousTimestamp) / 1000, 0, 0.05);
      lastFrameRef.current = timestamp;
      setSimMinutes((value) => value + speed * deltaSeconds * 0.04);
      animationFrameRef.current = window.requestAnimationFrame(tick);
    };

    animationFrameRef.current = window.requestAnimationFrame(tick);

    return () => {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
      }
      animationFrameRef.current = null;
      lastFrameRef.current = null;
    };
  }, [isPlaying, speed]);

  const scenario = data?.scenarios[0];
  const visibleEvents = useMemo(() => {
    const events = data?.events ?? [];
    return events.filter((event) => timeToMinutes(event.time) <= simMinutes).slice(-8).reverse();
  }, [data?.events, simMinutes]);

  const blueForce = data?.forces.find((force) => force.id === "blue");
  const redForce = data?.forces.find((force) => force.id === "red");

  const pushCommand = (message: string) => {
    setCommandFeed((current) => [`${formatMissionTime(simMinutes)} ${message}`, ...current].slice(0, 7));
  };

  const resetScenario = () => {
    setSimMinutes(42);
    setIsPlaying(true);
    setCamera(initialCamera);
    setCameraLock("follow");
    pushCommand("Scenario clock reset; combat replay restarted");
  };

  if (!data || !scenario || !blueForce || !redForce) {
    return (
      <div className="flex h-screen items-center justify-center bg-midnight text-slate-100">
        <div className="glass-panel px-8 py-6 text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-pulse rounded-full border border-blueforce/60 shadow-glowBlue" />
          <p className="text-sm uppercase tracking-[0.25em] text-blueforce">Synchronizing tactical data</p>
        </div>
      </div>
    );
  }

  return (
    <main className={`skystrike-shell relative min-h-screen w-full min-w-[1366px] overflow-x-auto overflow-y-visible bg-midnight font-command text-slate-100 ${!isPlaying ? "sim-paused" : ""}`}>
      <div className="dashboard-ocean-backdrop absolute inset-0" />
      <div className="ocean-atmosphere absolute inset-0" />
      <div className="relative flex min-h-screen flex-col gap-3 p-3">
        <TopNavigation
          activeTab={activeTab}
          onExit={() => {
            setIsPlaying(false);
            setModal("exit");
          }}
          onOpenModal={setModal}
          onTabChange={setActiveTab}
        />

        {activeTab === "Simulation" ? (
          <section className="simulation-layout">
            <ForcePanel force={blueForce} strength={blueForce.strength} side="left" />

            <div className="cinematic-map-shell relative min-h-0 overflow-hidden rounded-md border border-cyan-200/20 bg-slate-950/20 shadow-panel">
              <SimulationControls
                isPlaying={isPlaying}
                speed={speed}
                time={formatMissionTime(simMinutes)}
                onTogglePlay={() => setIsPlaying((value) => !value)}
                onCycleSpeed={() => setSpeed((value) => (value === 1 ? 2 : value === 2 ? 4 : 1))}
              />
              <CombatMap
                aircraft={data.aircraft}
                camera={camera}
                cameraMode={cameraMode}
                cameraLock={cameraLock}
                fleetPosture={fleetPosture}
                fleetSettings={fleetSettings}
                islands={referenceIslands}
                missionSettings={missionSettings}
                ships={data.ships}
                simMinutes={simMinutes}
                viewOptions={viewOptions}
                onCameraChange={setCamera}
                onCameraLock={setCameraLock}
              />
            </div>

            <ForcePanel force={redForce} strength={redForce.strength} side="right" />

            <BottomDeck
              camera={camera}
              cameraLock={cameraLock}
              cameraMode={cameraMode}
              events={visibleEvents}
              ships={data.ships}
              aircraft={data.aircraft}
              fleetPosture={fleetPosture}
              fleetSettings={fleetSettings}
              missionSettings={missionSettings}
              simMinutes={simMinutes}
              viewOptions={viewOptions}
              weather={data.weather}
              onCameraChange={setCamera}
              onCameraLock={setCameraLock}
              onCameraMode={setCameraMode}
              onResetCamera={() => setCamera(initialCamera)}
              onViewOption={(key) => setViewOptions((value) => ({ ...value, [key]: !value[key] }))}
            />
          </section>
        ) : (
          <section className="grid min-h-[calc(100vh-6rem)] flex-1 grid-cols-[19rem_minmax(0,1fr)_19rem] gap-3">
            <ForcePanel force={blueForce} strength={blueForce.strength} side="left" />
            <CommandWorkspace
              activeTab={activeTab}
              blueForce={blueForce}
              commandFeed={commandFeed}
              fleetPosture={fleetPosture}
              fleetSettings={fleetSettings}
              missionSettings={missionSettings}
              redForce={redForce}
              simMinutes={simMinutes}
              visibleEvents={visibleEvents}
              onFleetPosture={setFleetPosture}
              onFleetSettings={setFleetSettings}
              onIssueCommand={pushCommand}
              onMissionSettings={setMissionSettings}
              onResetScenario={resetScenario}
              onTabChange={setActiveTab}
            />
            <ForcePanel force={redForce} strength={redForce.strength} side="right" />
          </section>
        )}

        {modal && (
          <CommandModal
            modal={modal}
            speed={speed}
            viewOptions={viewOptions}
            onClose={() => setModal(null)}
            onSetSpeed={setSpeed}
            onShowResults={() => {
              setActiveTab("Results");
              setModal(null);
            }}
            onToggleOption={(key) => setViewOptions((value) => ({ ...value, [key]: !value[key] }))}
          />
        )}
      </div>
    </main>
  );
}

function SkyStrikeLogo() {
  return (
    <svg className="h-9 w-9 text-white" viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <path d="M24 4.8 L27.6 17.4 L40.8 20.1 L29.2 26.7 L31.3 39.8 L24 31.8 L16.7 39.8 L18.8 26.7 L7.2 20.1 L20.4 17.4 Z" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" opacity="0.96" />
      <path d="M15.4 30.2 L32.8 13.4" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M11.4 36.5 L21.5 26.7 M26.6 21.6 L36.8 11.7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.62" />
      <circle cx="24" cy="24" r="3.1" fill="currentColor" />
    </svg>
  );
}

function TopNavigation({
  activeTab,
  onExit,
  onOpenModal,
  onTabChange
}: {
  activeTab: ActiveTab;
  onExit: () => void;
  onOpenModal: (modal: ModalKind) => void;
  onTabChange: (tab: ActiveTab) => void;
}) {
  return (
    <header className="command-nav glass-panel flex h-14 items-center justify-between px-4">
      <button className="flex min-w-52 items-center gap-3 text-left" onClick={() => onTabChange("Simulation")}>
        <div className="grid h-10 w-10 place-items-center rounded border border-white/25 bg-white/5">
          <SkyStrikeLogo />
        </div>
        <div>
          <h1 className="text-xl font-semibold uppercase text-white">SkyStrike</h1>
          <p className="text-xs uppercase tracking-[0.24em] text-slate-400">By: David Kachroo</p>
        </div>
      </button>

      <nav className="flex items-center gap-1 rounded border border-cyan-100/10 bg-slate-950/45 p-1">
        {tabLabels.map((tab) => (
          <button
            className={`rounded px-4 py-2 text-xs font-semibold uppercase text-slate-300 transition ${
              tab === activeTab ? "bg-blueforce/15 text-blueforce" : "hover:bg-white/5 hover:text-white"
            }`}
            key={tab}
            onClick={() => onTabChange(tab)}
          >
            {tab}
          </button>
        ))}
      </nav>

      <div className="flex items-center gap-2">
        <IconButton icon={<HelpCircle />} label="Help" onClick={() => onOpenModal("help")} />
        <IconButton icon={<Settings />} label="Settings" onClick={() => onOpenModal("settings")} />
        <button className="flex items-center gap-2 rounded border border-redforce/30 bg-redforce/10 px-3 py-2 text-xs font-semibold uppercase text-red-100 transition hover:bg-redforce/20" onClick={onExit}>
          <LogOut className="h-4 w-4" />
          Exit Simulation
        </button>
      </div>
    </header>
  );
}

function IconButton({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button className="grid h-9 w-9 place-items-center rounded border border-cyan-100/10 bg-white/5 text-slate-300 transition hover:border-blueforce/50 hover:text-white" onClick={onClick} title={label}>
      <span className="h-4 w-4 [&>svg]:h-4 [&>svg]:w-4">{icon}</span>
    </button>
  );
}

function SimulationControls({
  isPlaying,
  onCycleSpeed,
  onTogglePlay,
  speed,
  time
}: {
  isPlaying: boolean;
  onCycleSpeed: () => void;
  onTogglePlay: () => void;
  speed: number;
  time: string;
}) {
  return (
    <div className="absolute left-1/2 top-4 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full border border-cyan-100/15 bg-slate-950/75 px-3 py-2 shadow-panel backdrop-blur-xl">
      <button
        className="grid h-8 w-8 place-items-center rounded-full border border-blueforce/40 bg-blueforce/15 text-blueforce transition hover:bg-blueforce/25"
        onClick={onTogglePlay}
        title={isPlaying ? "Pause" : "Play"}
      >
        {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      </button>
      <div className="min-w-20 text-center text-lg font-semibold text-white">{time}</div>
      <button
        className="rounded-full border border-cyan-100/15 bg-white/5 px-3 py-1.5 text-xs font-bold uppercase text-slate-200 transition hover:border-blueforce/50"
        onClick={onCycleSpeed}
      >
        x{speed}
      </button>
    </div>
  );
}

function ForcePanel({ force, side, strength }: { force: Force; side: "left" | "right"; strength: number }) {
  const isBlue = force.id === "blue";

  return (
    <aside className={"force-panel reference-force-panel min-h-0 overflow-x-hidden overflow-y-auto " + (side === "right" ? "force-panel-red" : "force-panel-blue")}>
      <div className="reference-force-title">
        <p className={"reference-force-name " + (isBlue ? "text-blueforce" : "text-redforce")}>{force.name}</p>
      </div>

      <div className="reference-force-summary">
        <h2>{force.taskForce}</h2>
        <p>Strength: {strength}%</p>
        <div className="reference-strength-track">
          <div
            className={"reference-strength-fill " + (isBlue ? "reference-strength-blue" : "reference-strength-red")}
            style={{ width: String(strength) + "%" }}
          />
        </div>
      </div>

      <PanelSection title="Navy" tone={isBlue ? "blue" : "red"}>
        <div className="sidebar-unit-list sidebar-ship-list">
          {force.ships.slice(0, 5).map((ship) => (
            <UnitRow
              accent={force.color}
              category="ship"
              detail={ship.type ?? ""}
              forceId={force.id}
              key={ship.id}
              label={ship.designation}
              unitKind={shipKindFromSummary(ship.designation, ship.type)}
            />
          ))}
        </div>
      </PanelSection>

      <PanelSection title="Airforce" tone={isBlue ? "blue" : "red"}>
        <div className="sidebar-unit-list sidebar-air-list">
          {force.airWing.slice(0, 4).map((aircraft) => (
            <UnitRow
              accent={force.color}
              category="aircraft"
              detail={"x" + aircraft.quantity}
              forceId={force.id}
              key={aircraft.id}
              label={aircraft.designation}
              unitKind={aircraftBadge(aircraft.designation).toLowerCase()}
            />
          ))}
        </div>
      </PanelSection>
    </aside>
  );
}

function PanelSection({ children, title, tone }: { children: ReactNode; title: string; tone: "blue" | "red" }) {
  return (
    <section className="reference-panel-section">
      <div className={"reference-section-title " + (tone === "blue" ? "text-blueforce" : "text-redforce")}>{title}</div>
      {children}
    </section>
  );
}

function UnitRow({
  accent,
  category,
  detail,
  forceId,
  label,
  unitKind
}: {
  accent: string;
  category: "ship" | "aircraft";
  detail: string;
  forceId: ForceId;
  label: string;
  unitKind: ShipUnit["type"] | string;
}) {
  return (
    <div className={"unit-row reference-unit-row reference-unit-" + category} title={label}>
      <UnitGlyph accent={accent} category={category} forceId={forceId} unitKind={unitKind} />
      <div className="reference-unit-copy">
        <div className={"reference-unit-label " + (label.length > 23 ? "reference-unit-label-extra-long" : label.length > 15 ? "reference-unit-label-long" : "")}>{label}</div>
        {category === "ship" && detail ? <div className="reference-unit-detail">{detail}</div> : null}
      </div>
      {category === "aircraft" && detail ? <span className="reference-unit-quantity">{detail}</span> : null}
    </div>
  );
}

function UnitGlyph({ category, unitKind }: { accent: string; category: "ship" | "aircraft"; forceId: ForceId; unitKind: ShipUnit["type"] | string }) {
  const aircraftKind = unitKind === "radar" ? "radar" : unitKind === "lift" || unitKind === "helo" ? "lift" : unitKind === "drone" ? "drone" : "jet";
  const thumbnail = category === "ship" ? unitKind : aircraftKind;

  return <img alt="" aria-hidden="true" className="unit-glyph reference-unit-image" src={"/assets/unit-thumbnails/" + thumbnail + ".png"} />;
}

function CombatMap({
  aircraft,
  camera,
  cameraLock,
  cameraMode,
  fleetPosture,
  fleetSettings,
  islands,
  missionSettings,
  onCameraChange,
  onCameraLock,
  ships,
  simMinutes,
  viewOptions
}: {
  aircraft: AircraftUnit[];
  camera: CameraState;
  cameraLock: CameraLock;
  cameraMode: CameraMode;
  fleetPosture: (typeof fleetActions)[number];
  fleetSettings: FleetSettings;
  islands: ScenarioIsland[];
  missionSettings: MissionSettings;
  onCameraChange: (camera: CameraState | ((camera: CameraState) => CameraState)) => void;
  onCameraLock: (mode: CameraLock) => void;
  ships: ShipUnit[];
  simMinutes: number;
  viewOptions: ViewOptions;
}) {
  const grid = useMemo(() => Array.from({ length: 12 }, (_, index) => index * 9), []);
  const waveBands = useMemo(() => Array.from({ length: 12 }, (_, index) => ({
    d: `M -8 ${3 + index * 1.62} C ${12 + index * 0.7} ${1.7 + index * 1.68}, ${26 + index * 0.55} ${4.2 + index * 1.46}, ${108} ${2.6 + index * 1.62}`,
    opacity: 0.06 + (index % 5) * 0.018,
    width: 0.05 + (index % 4) * 0.025
  })), []);
  const dragRef = useRef<CameraDrag | null>(null);
  const shipStates = ships.map((ship, index) => ({ ship, ...shipState(ship, simMinutes, index, fleetSettings, fleetPosture) }));
  const aircraftStates = aircraft.flatMap((flight, index) => {
    const adjustedPath = adjustedAircraftPath(flight, missionSettings, fleetSettings, fleetPosture);
    const copies = visualAircraftCopies(flight, fleetSettings);

    return Array.from({ length: copies }, (_, copy) => {
      const lane = copy - (copies - 1) / 2;
      const phase = aircraftPhase(flight, index, simMinutes, missionSettings, fleetSettings) + copy * 0.105 + lane * 0.018;
      const wrappedPhase = phase % 1;
      const normalizedPhase = wrappedPhase < 0 ? wrappedPhase + 1 : wrappedPhase;
      if (normalizedPhase < 0.03 || normalizedPhase > 0.965) return null;
      const pathPoint = cubicAt(adjustedPath, normalizedPhase);
      const pathHeadingValue = pathHeading(adjustedPath, normalizedPhase);
      const point = formationPoint(pathPoint, pathHeadingValue, copy, copies);
      const nextPhase = Math.min(normalizedPhase + 0.012, 0.965);
      const nextPathPoint = cubicAt(adjustedPath, nextPhase);
      const nextPathHeading = pathHeading(adjustedPath, nextPhase);
      const nextPoint = formationPoint(nextPathPoint, nextPathHeading, copy, copies);
      const heading = (Math.atan2(nextPoint.y - point.y, nextPoint.x - point.x) * 180) / Math.PI;
      return { flight, heading, index: index * 4 + copy, key: `${flight.id}-${copy}`, point };
    }).filter((state): state is { flight: AircraftUnit; heading: number; index: number; key: string; point: Point } => state !== null);
  });
  const blueCarrierState = shipStates.find(({ ship }) => ship.id === "blue-cvn-78");
  const redCarrierState = shipStates.find(({ ship }) => ship.id === "red-cvn-76");

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      x: event.clientX,
      y: event.clientY,
      panX: camera.panX,
      panY: camera.panY,
      yaw: camera.yaw,
      pitch: camera.pitch,
      mode: cameraMode === "3d" && !event.shiftKey ? "rotate" : "pan"
    };
    if (cameraLock === "follow") onCameraLock("free");
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;

    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;

    if (drag.mode === "rotate") {
      onCameraChange((value) => ({
        ...value,
        yaw: clamp(drag.yaw + dx * 0.16, -18, 18),
        pitch: clamp(drag.pitch - dy * 0.12, -2, 24)
      }));
      return;
    }

    onCameraChange((value) => ({
      ...value,
      panX: clamp(drag.panX + dx, -180, 180),
      panY: clamp(drag.panY + dy, -120, 120)
    }));
  };

  const stopDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (cameraLock === "follow") onCameraLock("free");
    onCameraChange((value) => ({ ...value, zoom: clamp(value.zoom - event.deltaY * 0.0012, 0.74, 1.48) }));
  };

  const stageTransform = `translate(${camera.panX}px, ${camera.panY}px) scale(${camera.zoom}) ${
    cameraMode === "3d" ? `rotateX(${camera.pitch}deg) rotateZ(${camera.yaw}deg)` : ""
  }`;

  return (
    <div
      className="map-camera absolute inset-0 overflow-hidden"
      onDoubleClick={() => onCameraChange(initialCamera)}
      onPointerCancel={stopDrag}
      onPointerDown={handlePointerDown}
      onPointerLeave={stopDrag}
      onPointerMove={handlePointerMove}
      onPointerUp={stopDrag}
      onWheel={handleWheel}
    >
      <div
        className={`map-stage ${cameraMode === "3d" ? "map-stage-3d" : ""} ${cameraLock === "follow" ? "map-follow" : ""}`}
        style={{ transform: stageTransform }}
      >
        <svg className="h-full w-full" viewBox="0 0 100 56.25" preserveAspectRatio="none" role="img" aria-label="SkyStrike tactical ocean map">
          <defs>
            <linearGradient id="oceanGlow" x1="0%" x2="100%" y1="0%" y2="100%">
              <stop offset="0%" stopColor="#1c5264" />
              <stop offset="26%" stopColor="#12394d" />
              <stop offset="62%" stopColor="#0a273a" />
              <stop offset="100%" stopColor="#061622" />
            </linearGradient>
            <radialGradient id="sunSheen" cx="42%" cy="36%" r="62%">
              <stop offset="0%" stopColor="rgba(190,226,236,0.16)" />
              <stop offset="42%" stopColor="rgba(72,132,152,0.12)" />
              <stop offset="100%" stopColor="rgba(2,8,18,0)" />
            </radialGradient>
            <linearGradient id="wakeBlue" x1="0%" x2="100%">
              <stop offset="0%" stopColor="rgba(222,246,255,0)" />
              <stop offset="42%" stopColor="rgba(172,229,255,0.28)" />
              <stop offset="100%" stopColor="rgba(236,252,255,0.72)" />
            </linearGradient>
            <linearGradient id="wakeRed" x1="0%" x2="100%">
              <stop offset="0%" stopColor="rgba(255,207,194,0)" />
              <stop offset="46%" stopColor="rgba(255,124,92,0.22)" />
              <stop offset="100%" stopColor="rgba(255,239,229,0.68)" />
            </linearGradient>
            <linearGradient id="islandGround" x1="0%" x2="100%" y1="0%" y2="100%">
              <stop offset="0%" stopColor="#73814d" />
              <stop offset="38%" stopColor="#365b35" />
              <stop offset="100%" stopColor="#132c21" />
            </linearGradient>
            <linearGradient id="sandEdge" x1="0%" x2="100%">
              <stop offset="0%" stopColor="#d8c796" />
              <stop offset="55%" stopColor="#a99261" />
              <stop offset="100%" stopColor="#6d6047" />
            </linearGradient>
            <filter id="oceanNoise" x="-8%" y="-8%" width="116%" height="116%">
              <feTurbulence baseFrequency="0.016 0.064" numOctaves="3" seed="13" type="fractalNoise" result="noise" />
              <feColorMatrix in="noise" type="matrix" values="0 0 0 0 0.16  0 0 0 0 0.32  0 0 0 0 0.42  0 0 0 .25 0" />
            </filter>
            <filter id="unitShadow" x="-70%" y="-70%" width="240%" height="240%">
              <feDropShadow dx="0.16" dy="0.28" floodColor="#00040a" floodOpacity="0.58" stdDeviation="0.18" />
            </filter>
            <filter id="terrainShadow" x="-45%" y="-45%" width="190%" height="190%">
              <feDropShadow dx="0.42" dy="0.56" floodColor="#000610" floodOpacity="0.45" stdDeviation="0.24" />
            </filter>
            <filter id="softGlow">
              <feGaussianBlur stdDeviation="0.7" />
            </filter>
          </defs>

          <rect width="100" height="56.25" fill="url(#oceanGlow)" />
          <rect width="100" height="56.25" fill="url(#sunSheen)" />
          <rect className="ocean-noise-layer" width="100" height="56.25" fill="rgba(210, 240, 247, 0.045)" opacity="0.22" />
          <g className="ocean-wave-field">
            {waveBands.map((wave, index) => (
              <path className="ocean-wave" d={wave.d} key={`wave-${index}`} opacity={wave.opacity} strokeWidth={wave.width} />
            ))}
          </g>
          <g className="coordinate-grid" opacity="0.055">
            {grid.map((x) => (
              <line key={`vx-${x}`} x1={x} x2={x} y1="0" y2="56.25" />
            ))}
            {grid.slice(0, 8).map((y) => (
              <line key={`hy-${y}`} x1="0" x2="100" y1={y} y2={y} />
            ))}
          </g>

          <g opacity="0.98">
            {islands.map((island) => (
              <Island key={island.id} island={island} />
            ))}
          </g>

          {blueCarrierState && (
            <MissionOverlays point={blueCarrierState.point} missionSettings={missionSettings} />
          )}

          {blueCarrierState && <RadioBeacon point={blueCarrierState.point} force="blue" />}
          {redCarrierState && <RadioBeacon point={redCarrierState.point} force="red" />}

          {viewOptions.waypoints && (
            <g>
              {aircraft.map((flight) => {
                return (
                  <path
                    className="path-dash"
                    d={curvePath(adjustedAircraftPath(flight, missionSettings, fleetSettings, fleetPosture))}
                    fill="none"
                    key={flight.id}
                    opacity="0.54"
                    stroke={forceTint[flight.force].line}
                    strokeDasharray="1.1 1.2"
                    strokeLinecap="round"
                    strokeWidth="0.16"
                  />
                );
              })}
            </g>
          )}

          {viewOptions.threatZones && (
            <g>
              {shipStates
                .filter(({ ship }) => ship.force === "red")
                .map(({ point, ship }) => (
                  <circle
                    className="threat-zone"
                    cx={point.x}
                    cy={point.y}
                    fill="rgba(255, 76, 56, 0.045)"
                    key={`${ship.id}-threat`}
                    r={ship.threatRange * 0.38}
                    stroke="#fa3c2c"
                    strokeDasharray="0.75 1.2"
                    strokeWidth="0.16"
                  />
                ))}
            </g>
          )}

          {(viewOptions.radar || viewOptions.rangeRings) && (
            <g>
              {shipStates
                .filter(({ ship }) => ship.force === "blue" || viewOptions.rangeRings)
                .map(({ point, ship }) => (
                  <RadarRings key={`${ship.id}-rings`} point={point} ship={ship} showPulse={viewOptions.radar && ship.type !== "carrier"} showRange={viewOptions.rangeRings && ship.type !== "carrier"} />
                ))}
            </g>
          )}

          <g opacity="0.6">
            {shipStates
              .filter(({ ship }) => ship.type === "cruiser" || ship.type === "destroyer")
              .map(({ point, ship }) => (
                <TargetCone key={`${ship.id}-cone`} point={point} ship={ship} />
              ))}
          </g>

          <EngagementEffects fleetSettings={fleetSettings} missionSettings={missionSettings} shipStates={shipStates} simMinutes={simMinutes} />

          <g>
            {shipStates.map(({ heading, point, ship }) => (
              <ShipMarker heading={heading} key={ship.id} point={point} ship={ship} showLabel={viewOptions.labels} />
            ))}
          </g>

          <g>
            {aircraftStates.map(({ flight, heading, index, key, point }) => (
              <AircraftMarker flight={flight} heading={heading} index={index} key={key} point={point} showLabel={viewOptions.labels && key.endsWith("-0")} />
            ))}
          </g>
        </svg>
      </div>
      <div className="pointer-events-none absolute bottom-4 left-4 rounded border border-cyan-100/15 bg-slate-950/55 px-3 py-2 text-[10px] uppercase tracking-[0.18em] text-slate-400 backdrop-blur">
        Grid 23N / 171W
      </div>
      <div className="pointer-events-none absolute bottom-4 right-4 flex items-center gap-2 rounded border border-cyan-100/15 bg-slate-950/55 px-3 py-2 text-[10px] uppercase tracking-[0.18em] text-slate-400 backdrop-blur">
        <Radio className="h-3.5 w-3.5 text-blueforce" />
        AZ {Math.round(camera.yaw).toString().padStart(3, "0")} / EL {Math.round(camera.pitch).toString().padStart(2, "0")}
      </div>
    </div>
  );
}

function MissionOverlays({ missionSettings, point }: { missionSettings: MissionSettings; point: Point }) {
  const patrolRadius = missionRingScale(missionSettings.patrolRadius, 12, 7.5, 17);
  const safeRadius = missionRingScale(missionSettings.engagementRange, 12, 4.2, 11.8);

  return (
    <g>
      <circle className="mission-ring mission-patrol" cx={point.x} cy={point.y} r={patrolRadius} />
      <circle className="mission-ring mission-safe" cx={point.x} cy={point.y} r={safeRadius} />
      <g className="map-note map-note-compact" transform="translate(1.55 1.34)">
        <rect width="10.2" height="2.58" rx="0.3" />
        <text x="0.52" y="0.98">Patrol Area</text>
        <text x="0.52" y="1.88">{missionSettings.patrolRadius} nautical miles</text>
      </g>
    </g>
  );
}

function Island({ island }: { island: ScenarioIsland }) {
  const point = mapPoint({ x: island.x, y: island.y });
  const scale = island.scale;
  const isCentral = island.id === "central-island";
  const variant = island.id === "northwest-island" ? "ridge" : island.id === "northeast-island" ? "compact" : island.id === "central-island" ? "atoll" : "crescent";
  const shapes = {
    ridge: {
      reef: "M -14.0 -0.6 L -11.4 -4.6 L -6.7 -6.5 L -2.3 -5.8 L 1.1 -7.0 L 6.2 -4.7 L 11.9 -3.7 L 14.2 -0.8 L 12.0 2.0 L 13.1 4.3 L 7.1 6.7 L 1.2 5.9 L -2.9 7.4 L -8.4 5.3 L -12.9 3.9 L -15.0 1.1 Z",
      sand: "M -11.6 -0.55 L -9.5 -3.52 L -5.8 -4.88 L -2.15 -4.24 L 0.78 -5.1 L 5.18 -3.55 L 9.82 -2.82 L 11.72 -0.62 L 9.88 1.45 L 10.72 3.18 L 5.78 5.02 L 0.7 4.52 L -2.78 5.52 L -7.3 3.92 L -10.7 2.88 L -12.28 0.82 Z",
      shore: "M -10.45 1.32 L -5.8 3.72 L 0.52 4.05 L 5.78 3.4 L 9.88 1.45 L 8.5 3.62 L 2.2 5.02 L -3.55 4.9 L -8.88 3.08 Z",
      rock: "M -9.75 -0.52 L -6.8 -3.38 L -3.18 -3.75 L -0.72 -3.22 L 2.45 -3.92 L 6.72 -2.18 L 8.8 -0.32 L 7.45 2.15 L 3.05 3.48 L -2.28 3.58 L -6.58 2.35 L -9.22 1.05 Z",
      canopy: "M -7.62 -0.75 L -4.18 -2.35 L -0.52 -2.88 L 2.48 -2.15 L 5.82 -0.82 L 4.2 1.52 L 0.5 2.35 L -3.95 1.82 L -7.0 0.62 Z",
      lagoon: "M -1.8 1.12 L 0.98 0.45 L 3.95 1.22 L 5.1 2.28 L 2.62 3.08 L -0.75 2.72 L -2.42 1.82 Z",
      ridges: [
        "M -6.28 -3.15 L -2.58 -1.82 L 1.62 -2.05 L 5.7 -1.22",
        "M -7.1 1.58 L -3.2 0.42 L 1.3 0.85 L 6.25 2.42",
        "M -4.7 -0.55 L -1.05 -1.12 L 2.5 -0.62 L 5.28 0.22"
      ],
      trees: [[-6.1, -0.35, 0.64, 0.28], [-4.1, -1.65, 0.82, 0.32], [-1.55, -1.92, 0.72, 0.3], [1.4, -1.55, 0.86, 0.34], [3.95, -0.55, 0.7, 0.28], [-1.15, 0.95, 0.68, 0.27]],
      surf: [
        "M -12.4 3.1 L -8.2 5.15 L -2.2 6.15 L 4.3 5.55 L 11.2 2.75",
        "M -11.85 -3.85 L -6.2 -5.95 L -0.5 -6.12 L 5.72 -4.6 L 11.8 -1.8"
      ]
    },
    compact: {
      reef: "M -8.6 -3.2 L -4.4 -6.2 L 0.4 -5.15 L 3.6 -6.55 L 8.7 -2.6 L 10.2 1.85 L 6.4 5.88 L 1.85 5.2 L -1.9 7.08 L -6.75 4.55 L -10.4 0.65 Z",
      sand: "M -6.9 -2.62 L -3.5 -4.98 L 0.32 -4.22 L 2.82 -5.22 L 6.92 -2.05 L 8.15 1.52 L 5.22 4.55 L 1.45 4.08 L -1.55 5.48 L -5.45 3.45 L -8.28 0.38 Z",
      shore: "M -6.35 0.82 L -2.75 3.05 L 1.45 3.38 L 5.22 2.25 L 6.85 0.75 L 5.12 3.55 L 1.0 4.45 L -3.95 3.78 Z",
      rock: "M -5.7 -1.75 L -2.72 -3.22 L 0.15 -2.78 L 2.32 -3.45 L 5.42 -1.22 L 5.8 1.12 L 3.35 2.95 L -0.28 3.2 L -3.55 2.1 L -5.82 0.28 Z",
      canopy: "M -4.62 -1.18 L -1.92 -2.25 L 1.22 -2.02 L 3.95 -0.95 L 3.28 0.95 L 0.55 1.92 L -2.58 1.45 L -4.88 0.15 Z",
      lagoon: "M -1.05 1.18 L 0.58 0.58 L 2.78 0.88 L 3.78 1.82 L 1.8 2.55 L -0.55 2.12 Z",
      ridges: [
        "M -3.82 -2.82 L -1.05 -1.28 L 2.9 -1.72",
        "M -4.82 0.55 L -1.92 -0.08 L 1.58 0.42 L 4.38 1.48",
        "M -2.25 2.2 L 0.55 2.62 L 3.42 1.85"
      ],
      trees: [[-3.5, -0.35, 0.62, 0.28], [-1.65, -1.35, 0.72, 0.3], [0.78, -1.35, 0.78, 0.32], [2.55, -0.58, 0.62, 0.26], [0.45, 0.58, 0.55, 0.23]],
      surf: [
        "M -7.95 2.65 L -4.0 4.78 L 0.8 5.35 L 5.85 3.95 L 8.28 1.62",
        "M -7.38 -3.52 L -3.38 -5.45 L 1.85 -5.68 L 7.42 -1.52"
      ]
    },
    atoll: {
      reef: "M -13.8 -2.3 L -10.2 -6.8 L -4.1 -7.55 L -0.9 -9.05 L 5.35 -6.85 L 10.95 -5.42 L 14.65 -1.28 L 13.25 3.15 L 15.0 5.2 L 8.58 8.45 L 2.15 8.02 L -2.55 9.65 L -8.85 6.72 L -14.9 4.0 L -16.02 -0.55 Z",
      sand: "M -11.25 -1.95 L -8.28 -5.35 L -3.38 -5.9 L -0.65 -7.05 L 4.42 -5.25 L 8.92 -4.1 L 11.92 -0.82 L 10.78 2.65 L 12.25 4.25 L 7.05 6.85 L 1.82 6.52 L -2.12 7.75 L -7.32 5.28 L -12.25 3.15 L -13.0 -0.42 Z",
      shore: "M -10.1 2.08 L -5.55 4.95 L -0.58 5.72 L 4.9 5.25 L 9.88 2.95 L 8.3 5.58 L 2.1 7.08 L -3.58 6.35 L -8.62 4.18 Z",
      rock: "M -8.62 -1.4 L -5.38 -3.92 L -1.12 -4.68 L 2.88 -3.52 L 6.52 -2.92 L 8.2 -0.2 L 6.78 2.78 L 2.58 4.35 L -2.62 4.18 L -6.9 2.52 L -8.92 0.48 Z",
      canopy: "M -6.35 -1.35 L -2.9 -3.02 L 1.4 -3.25 L 5.72 -1.55 L 5.05 1.28 L 1.68 2.82 L -2.58 2.28 L -5.72 0.65 Z",
      lagoon: "M -2.92 1.72 L -0.18 0.52 L 3.95 0.58 L 6.42 2.32 L 3.78 4.02 L 0.42 4.32 L -2.98 3.1 Z",
      ridges: [
        "M -5.45 -3.62 L -1.58 -1.65 L 2.5 -1.58 L 6.1 -2.62",
        "M -6.98 0.52 L -3.2 -0.45 L 1.22 -0.08 L 6.02 1.72",
        "M -4.52 2.58 L -1.15 3.12 L 2.9 3.0 L 5.85 2.05"
      ],
      trees: [[-5.0, -0.18, 0.78, 0.3], [-3.15, -1.62, 0.82, 0.32], [-0.32, -1.95, 0.98, 0.36], [2.52, -1.2, 0.85, 0.32], [4.52, -0.25, 0.66, 0.25], [-1.95, 1.0, 0.62, 0.24]],
      surf: [
        "M -12.88 4.2 L -7.2 7.02 L -0.62 8.15 L 6.7 7.15 L 12.15 4.28",
        "M -12.18 -4.9 L -6.0 -7.1 L 0.42 -7.72 L 6.92 -6.0 L 12.1 -2.08"
      ],
      breakwater: "M -9.98 5.05 L -5.02 7.18 L 1.72 7.9 L 8.28 5.35"
    },
    crescent: {
      reef: "M -12.2 -2.25 L -7.75 -5.72 L -2.88 -6.35 L 2.45 -4.85 L 7.92 -1.72 L 11.18 1.85 L 8.12 5.62 L 2.75 6.38 L -1.1 4.52 L -4.75 5.52 L -9.85 3.18 L -12.88 -0.55 Z",
      sand: "M -9.9 -1.98 L -6.38 -4.62 L -2.48 -5.08 L 1.82 -3.88 L 6.22 -1.25 L 8.75 1.48 L 6.18 4.35 L 2.15 4.85 L -0.95 3.38 L -3.85 4.18 L -8.02 2.42 L -10.45 -0.35 Z",
      shore: "M -7.55 1.28 L -3.45 2.95 L 0.75 3.0 L 4.78 2.22 L 6.22 0.98 L 5.28 3.42 L 1.2 4.22 L -3.2 3.45 Z",
      rock: "M -7.05 -1.52 L -4.05 -3.18 L -0.18 -3.25 L 3.05 -2.02 L 5.82 0.0 L 4.65 2.18 L 1.05 3.0 L -2.35 2.25 L -5.28 1.15 L -7.15 -0.28 Z",
      canopy: "M -5.38 -1.45 L -2.4 -2.42 L 1.28 -2.25 L 4.18 -0.95 L 3.18 0.82 L 0.0 1.58 L -3.18 1.1 L -5.5 -0.22 Z",
      lagoon: "M -0.55 1.38 L 1.58 0.72 L 3.72 1.05 L 4.65 2.1 L 2.58 2.85 L 0.72 2.62 L -0.88 2.05 Z",
      ridges: [
        "M -4.45 -3.02 L -1.62 -1.65 L 1.42 -1.38 L 4.45 -2.05",
        "M -5.45 0.62 L -2.4 -0.18 L 1.35 0.35 L 5.05 1.88",
        "M -3.85 2.08 L -1.15 2.72 L 1.92 2.68 L 4.18 1.92"
      ],
      trees: [[-4.08, -0.78, 0.62, 0.26], [-2.12, -1.52, 0.72, 0.28], [0.28, -1.62, 0.78, 0.3], [2.62, -0.78, 0.64, 0.26], [-1.3, 0.45, 0.54, 0.22]],
      surf: [
        "M -9.55 3.28 L -5.02 5.38 L 0.55 5.72 L 6.2 4.25 L 9.1 1.9",
        "M -8.95 -4.08 L -3.82 -5.88 L 2.82 -4.82 L 8.92 -0.75"
      ]
    }
  } as const;
  const shape = shapes[variant];

  return (
    <g className={"real-island island-" + variant + (isCentral ? " central-island" : "")} filter="url(#terrainShadow)" transform={"translate(" + point.x + " " + point.y + ") rotate(" + island.rotation + ") scale(" + scale + ")"}>
      <path className="island-reef" d={shape.reef} />
      <path className="island-sand" d={shape.sand} />
      <path className="island-shore-shadow" d={shape.shore} />
      <path className="island-rock" d={shape.rock} />
      <path className="island-canopy" d={shape.canopy} />
      <path className="island-lagoon" d={shape.lagoon} />
      {shape.ridges.map((ridge, index) => (
        <path key={"ridge-" + index} className={"island-ridge" + (index === shape.ridges.length - 1 ? " island-ridge-dark" : "")} d={ridge} />
      ))}
      <g className="island-tree-clumps">
        {shape.trees.map(([cx, cy, rx, ry], index) => (
          <ellipse key={"tree-" + index} cx={cx} cy={cy} rx={rx} ry={ry} />
        ))}
      </g>
      {shape.surf.map((surf, index) => (
        <path key={"surf-" + index} className="island-surf" d={surf} />
      ))}
      {"breakwater" in shape && <path className="island-breakwater" d={shape.breakwater} />}
    </g>
  );
}

function RadioBeacon({ force, point }: { force: ForceId; point: Point }) {
  return (
    <g className={`radio-beacon radio-beacon-${force}`} aria-hidden="true">
      {[0, 1, 2].map((index) => (
        <circle className={`beacon-ring beacon-ring-${index}`} cx={point.x} cy={point.y} key={index} r="1.32" />
      ))}
      <circle className="beacon-core" cx={point.x} cy={point.y} r="0.26" />
    </g>
  );
}

function RadarRings({ point, ship, showPulse, showRange }: { point: Point; ship: ShipUnit; showPulse: boolean; showRange: boolean }) {
  const tint = forceTint[ship.force];

  return (
    <g>
      {showRange && (
        <>
          <circle cx={point.x} cy={point.y} fill="none" r={ship.radarRange * 0.22} stroke={tint.line} strokeOpacity="0.28" strokeWidth="0.12" />
          <circle cx={point.x} cy={point.y} fill="none" r={ship.radarRange * 0.38} stroke={tint.line} strokeDasharray="0.6 0.75" strokeOpacity="0.32" strokeWidth="0.14" />
        </>
      )}
      {showPulse && (
        <circle
          className={`radar-pulse ${ship.force === "blue" ? "radar-blue" : "radar-red"}`}
          cx={point.x}
          cy={point.y}
          fill="none"
          r={ship.radarRange * 0.44}
          stroke={tint.line}
          strokeWidth="0.22"
        />
      )}
    </g>
  );
}

function TargetCone({ point, ship }: { point: Point; ship: ShipUnit }) {
  const angle = ship.force === "blue" ? -3 : 183;
  const tint = forceTint[ship.force];
  const length = ship.type === "carrier" ? 13 : 10;

  return (
    <path
      d={`M ${point.x} ${point.y} l ${ship.force === "blue" ? length : -length} -3.2 q ${ship.force === "blue" ? 3 : -3} 3.2 0 6.4 Z`}
      fill={tint.fill}
      opacity="0.58"
      stroke={tint.line}
      strokeOpacity="0.22"
      strokeWidth="0.12"
      transform={`rotate(${angle} ${point.x} ${point.y})`}
    />
  );
}

function missileCurve(from: Point, to: Point, bend: number) {
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;
  return `M ${from.x} ${from.y} Q ${midX} ${midY + bend} ${to.x} ${to.y}`;
}

function EngagementEffects({ fleetSettings, missionSettings, shipStates, simMinutes }: { fleetSettings: FleetSettings; missionSettings: MissionSettings; shipStates: Array<{ ship: ShipUnit; point: Point; heading: number }> ; simMinutes: number }) {
  const blueCruiser = shipStates.find(({ ship }) => ship.id === "blue-cg-67");
  const blueDestroyer = shipStates.find(({ ship }) => ship.id === "blue-ddg-101");
  const redCruiser = shipStates.find(({ ship }) => ship.id === "red-cg-68");
  const redDestroyer = shipStates.find(({ ship }) => ship.id === "red-ddg-102");

  if (!blueCruiser || !blueDestroyer || !redCruiser || !redDestroyer) return null;

  const launchTempo = clamp(1.1 - missionSettings.launchDelay * 0.015, 0.72, 1.12);
  const missilePower = clamp(fleetSettings.missileReserve / 72, 0.45, 1.22);
  const missilePulse = (Math.sin(simMinutes * 3.2 * launchTempo) + 1) / 2;
  const redPulse = (Math.cos(simMinutes * 2.7) + 1) / 2;
  const blueImpact = { x: redCruiser.point.x - 1.2, y: redCruiser.point.y + 0.4 };
  const redImpact = { x: blueDestroyer.point.x + 1.0, y: blueDestroyer.point.y - 0.25 };

  return (
    <g>
      <path
        className="missile-trail missile-blue"
        d={missileCurve({ x: blueCruiser.point.x + 3.5, y: blueCruiser.point.y - 0.45 }, blueImpact, -6.2)}
        opacity={missilePulse > 0.28 ? 0.58 + missilePower * 0.28 : 0.12}
      />
      <path
        className="missile-trail missile-red"
        d={missileCurve({ x: redDestroyer.point.x - 3.3, y: redDestroyer.point.y - 0.45 }, redImpact, 5.2)}
        opacity={redPulse > 0.42 ? 0.78 : 0.12}
      />
      <g opacity={missilePulse > 0.52 ? 0.9 : 0.25}>
        <circle className="splash-ring" cx={blueImpact.x} cy={blueImpact.y} r="1.15" />
        <circle className="blast-core" cx={blueImpact.x + 0.32} cy={blueImpact.y - 0.18} r="0.44" />
      </g>
      <g opacity={redPulse > 0.58 ? 0.82 : 0.2}>
        <path className="fire-control-line" d={missileCurve({ x: redDestroyer.point.x - 2.4, y: redDestroyer.point.y - 0.2 }, redImpact, 3.8)} />
        <circle className="lock-flash" cx={redImpact.x} cy={redImpact.y} r="1.2" />
      </g>
    </g>
  );
}

function shipLabelPosition(ship: ShipUnit, point: Point) {
  const name = mapShipLabel(ship);
  const width = clamp(name.length * 0.38 + 1.55, ship.type === "carrier" ? 8.8 : 7.2, 12.9);
  const side = ship.force === "blue" ? 1 : -1;
  const yOffsets: Record<ShipUnit["type"], number> = {
    carrier: -2.9,
    cruiser: -4.5,
    destroyer: 2.5,
    frigate: 4.0,
    submarine: -1.2
  };
  const x = ship.force === "blue" ? point.x + 1.7 : point.x - width - 1.7;
  return { width, x: clamp(x, 1.2, 98 - width), y: clamp(point.y + yOffsets[ship.type], 1.3, 52.4), leaderX: point.x + side * 0.82 };
}

function ShipMarker({ heading, point, renderUnit = true, ship, showLabel }: { heading: number; point: Point; renderUnit?: boolean; ship: ShipUnit; showLabel: boolean }) {
  const tint = forceTint[ship.force];
  const scale = ship.type === "carrier" ? 1.09 : ship.type === "submarine" ? 0.72 : ship.type === "frigate" ? 0.81 : ship.type === "destroyer" ? 0.9 : 0.95;
  const label = shipLabelPosition(ship, point);
  const wakeLength = ship.type === "carrier" ? 11.6 : ship.type === "submarine" ? 5.45 : 8.2;
  const visualHeading = 0;
  const visualScaleX = ship.force === "red" ? -scale : scale;

  return (
    <g className="ship-marker">
      {ship.type !== "carrier" && (
        <g className="ship-wake" transform={`translate(${point.x} ${point.y}) rotate(${visualHeading + 180}) scale(${visualScaleX} ${scale})`}>
          <path className="wake-foam wake-main" d={`M 0 0 C -2.7 0.35, -5.8 0.74, -${wakeLength} 1.55`} stroke={`url(#${ship.force === "blue" ? "wakeBlue" : "wakeRed"})`} />
          <path className="wake-foam" d={`M -0.3 -0.2 C -2.8 -0.7, -5.9 -1.08, -${wakeLength * 0.95} -1.55`} stroke={`url(#${ship.force === "blue" ? "wakeBlue" : "wakeRed"})`} />
          <path className="wake-foam wake-soft" d={`M -0.8 0 C -4.2 0, -7.6 0.04, -${wakeLength * 1.18} 0.24`} stroke={`url(#${ship.force === "blue" ? "wakeBlue" : "wakeRed"})`} />
        </g>
      )}
      {renderUnit && (
        <>
          <ellipse className="ship-depth-shadow" cx={point.x - 0.12} cy={point.y + 0.58} rx={ship.type === "carrier" ? 3.8 : ship.type === "submarine" ? 1.8 : 2.22} ry={ship.type === "submarine" ? 0.34 : 0.6} />
          <g transform={`translate(${point.x} ${point.y}) rotate(${visualHeading}) scale(${visualScaleX} ${scale})`}>
            <ShipSilhouette type={ship.type} color={tint.line} />
          </g>
        </>
      )}
      {showLabel && (
        <g className="map-label">
          <line x1={label.leaderX} x2={label.x + (ship.force === "blue" ? 0.15 : label.width - 0.15)} y1={point.y - 0.14} y2={label.y + 1.05} stroke={tint.line} strokeOpacity="0.32" strokeWidth="0.07" />
          <rect x={label.x} y={label.y} width={label.width} height="2.45" rx="0.28" fill="rgba(1,8,15,0.76)" stroke={tint.line} strokeOpacity="0.4" strokeWidth="0.08" />
          <text x={label.x + 0.42} y={label.y + 0.98} fill="#f3fbff" fontSize="0.62" fontWeight="800">
            {mapShipLabel(ship)}
          </text>
          <text x={label.x + 0.42} y={label.y + 1.86} fill={tint.line} fontSize="0.46" fontWeight="800">
            {shipBadge(ship.type)}
          </text>
        </g>
      )}
    </g>
  );
}

function ShipSilhouette({ color, type }: { color: string; type: ShipUnit["type"] }) {
  const isRed = color.toLowerCase() === forceTint.red.line.toLowerCase();
  const hull = isRed ? "#ff6f55" : "#53cfff";
  const hullDark = isRed ? "#651d17" : "#073a51";
  const deck = isRed ? "#2b100d" : "#062d40";
  const shadow = "#040a10";
  const highlight = isRed ? "#ffd7ca" : "#e8fbff";
  const rim = isRed ? "#ffb19e" : "#b8f2ff";

  if (type === "carrier") {
    return (
      <g>
        <path d="M -8.3 -1.95 C -5.1 -2.36, 1.92 -2.18, 6.92 -1.38 C 8.48 -0.95, 9.32 -0.32, 9.52 0 C 9.08 0.64, 7.98 1.2, 6.4 1.66 C 1.25 2.18, -5.28 2.2, -8.52 1.62 C -9.45 0.75, -9.62 -0.75, -8.3 -1.95 Z" fill={hull} stroke={highlight} strokeWidth="0.16" />
        <path d="M -6.88 -1.02 C -2.4 -1.36, 2.7 -1.15, 6.7 -0.62 C 7.12 -0.38, 7.12 0.38, 6.55 0.68 C 2.25 1.12, -2.7 1.28, -6.98 0.92 C -7.52 0.18, -7.52 -0.28, -6.88 -1.02 Z" fill={deck} />
        <path d="M -4.92 -0.64 L 2.88 -0.48" stroke={highlight} strokeOpacity="0.68" strokeWidth="0.13" />
        <path d="M -4.4 0.12 L 3.8 0.32" stroke={rim} strokeOpacity="0.42" strokeWidth="0.1" />
        <path d="M 1.08 -1.78 C 1.92 -2.76, 3.88 -2.78, 4.72 -1.86 L 3.54 -1.04 L 1.34 -1.05 Z" fill={hullDark} stroke={color} strokeOpacity="0.8" strokeWidth="0.11" />
        <path d="M 2.6 -2.86 L 3.05 -3.68 L 3.45 -2.78" stroke={color} strokeWidth="0.12" />
        <path d="M -1.62 -0.92 C -0.82 -0.38, -0.78 0.32, -1.62 0.92" fill="none" stroke={color} strokeOpacity="0.55" strokeWidth="0.16" />
        <circle cx="-3.62" cy="0" r="0.18" fill={color} opacity="0.88" />
        <path d="M -8.3 1.28 C -4.4 2.8, 2.4 2.72, 6.45 1.62" fill="none" stroke={shadow} strokeOpacity="0.28" strokeWidth="0.22" />
      </g>
    );
  }

  if (type === "submarine") {
    return (
      <g opacity="0.96">
        <path d="M -5.9 0 C -3.9 -1.12, 1.85 -1.18, 5.45 -0.36 C 6.1 -0.18, 6.1 0.18, 5.45 0.36 C 1.88 1.2, -3.92 1.12, -5.9 0 Z" fill={hull} stroke={color} strokeOpacity="0.75" strokeWidth="0.16" />
        <path d="M -2.2 -0.05 C 0.2 0.42, 2.8 0.36, 5.35 -0.22" fill="none" stroke="#0b1218" strokeOpacity="0.38" strokeWidth="0.16" />
        <path d="M -0.62 -0.92 C 0.02 -1.82, 1.24 -1.72, 1.72 -0.74 L 0.98 -0.25 L -0.38 -0.26 Z" fill={hullDark} stroke={color} strokeOpacity="0.65" strokeWidth="0.1" />
        <path d="M -5.65 0 C -3.4 1.8, 2.9 1.78, 5.8 0.08" fill="none" stroke={color} strokeOpacity="0.24" strokeWidth="0.15" />
      </g>
    );
  }

  if (type === "frigate") {
    return (
      <g>
        <path d="M -5.45 -1.04 C -2.5 -1.35, 2.72 -1.12, 5.42 -0.42 C 5.95 -0.16, 5.95 0.2, 5.38 0.54 C 2.42 1.2, -2.95 1.32, -5.42 0.95 C -6.2 0.22, -6.2 -0.42, -5.45 -1.04 Z" fill={hull} stroke={highlight} strokeWidth="0.14" />
        <path d="M -1.55 -1.18 C -0.75 -1.88, 0.95 -1.72, 1.68 -0.82 L 1.0 -0.1 L -1.35 -0.14 Z" fill={hullDark} stroke={color} strokeOpacity="0.7" strokeWidth="0.1" />
        <path d="M 2.52 -0.58 L 3.56 -1.1 L 4.22 -0.42" fill={hullDark} stroke={color} strokeOpacity="0.5" strokeWidth="0.08" />
        <path d="M -3.82 0.18 L 3.72 0.28" stroke="#13212a" strokeOpacity="0.42" strokeWidth="0.12" />
        <circle cx="3.05" cy="0.02" r="0.32" fill="none" stroke={color} strokeOpacity="0.42" strokeWidth="0.1" />
      </g>
    );
  }

  const isDestroyer = type === "destroyer";
  return (
    <g>
      <path d={isDestroyer ? "M -6.28 -1.24 C -2.7 -1.56, 3.25 -1.34, 6.22 -0.48 C 6.92 -0.18, 6.92 0.2, 6.12 0.62 C 2.8 1.38, -3.2 1.48, -6.18 1.08 C -7.02 0.32, -7.02 -0.5, -6.28 -1.24 Z" : "M -6.55 -1.34 C -2.98 -1.72, 3.72 -1.48, 6.72 -0.54 C 7.48 -0.22, 7.48 0.22, 6.64 0.72 C 3.22 1.5, -3.38 1.58, -6.5 1.16 C -7.38 0.34, -7.38 -0.58, -6.55 -1.34 Z"} fill={hull} stroke={highlight} strokeWidth="0.15" />
      <path d="M -2.48 -1.28 C -1.48 -2.12, 0.55 -2.08, 1.72 -1.02 L 1.04 0.05 L -2.0 0.02 Z" fill={hullDark} stroke={color} strokeOpacity="0.72" strokeWidth="0.11" />
      <path d="M 1.82 -0.75 L 3.38 -1.45 L 4.28 -0.54" fill={hullDark} stroke={color} strokeOpacity="0.52" strokeWidth="0.09" />
      <path d="M -4.65 -0.18 C -4.08 -0.55, -3.55 -0.55, -3.05 -0.12 C -3.52 0.3, -4.06 0.32, -4.65 -0.18 Z" fill={color} opacity="0.32" />
      <path d="M -4.42 0.36 C -1.45 0.72, 2.25 0.68, 5.08 0.18" fill="none" stroke="#13212a" strokeOpacity="0.42" strokeWidth="0.12" />
      <path d="M 0.25 -2.0 L 0.62 -3.12 M 0.62 -3.12 L 1.28 -2.62" stroke={color} strokeOpacity="0.72" strokeWidth="0.1" />
    </g>
  );
}

function aircraftKind(flight: AircraftUnit) {
  if (flight.model.includes("SR-71") || flight.model.includes("Blackbird")) return "blackbird";
  if (flight.model.includes("E-2D") || flight.model.includes("Hawkeye") || flight.model.includes("E-7") || flight.model.includes("Wedgetail") || flight.model.includes("KJ-600") || flight.model.includes("Sentinel")) return "hawkeye";
  if (flight.model.includes("MH-60R") || flight.model.includes("Seahawk") || flight.model.includes("Ka-31") || flight.model.includes("Ka-27") || flight.model.includes("Helix") || flight.model.includes("V-22") || flight.model.includes("Osprey") || flight.model.includes("Z-20") || flight.model.includes("Harbin")) return "rotor";
  if (flight.model.includes("MQ-9B") || flight.model.includes("SeaGuardian") || flight.model.includes("Orion") || flight.model.includes("MQ-25") || flight.model.includes("GJ-11") || flight.model.includes("Stingray") || flight.model.includes("Sharp")) return "uav";
  if (flight.model.includes("Su-33") || flight.model.includes("Flanker") || flight.model.includes("J-20") || flight.model.includes("Dragon") || flight.model.includes("Su-57") || flight.model.includes("Felon")) return "flanker";
  return "strike";
}

function AircraftMarker({ flight, heading, index, point, renderUnit = true, showLabel }: { flight: AircraftUnit; heading: number; index: number; point: Point; renderUnit?: boolean; showLabel: boolean }) {
  const tint = forceTint[flight.force];
  const kind = aircraftKind(flight);
  const scale = kind === "blackbird" ? 0.62 : kind === "hawkeye" ? 0.55 : kind === "rotor" ? 0.5 : kind === "uav" ? 0.48 : 0.55;
  const aircraftLabel = mapAircraftLabel(flight.model);
  const labelWidth = clamp(aircraftLabel.length * 0.36 + 1.65, 6.4, 10.8);
  const isLightning = aircraftLabel.includes("F-35 Lightning");
  const labelX = clamp(flight.force === "red" ? point.x - labelWidth - (isLightning ? 0.48 : 1.15) : point.x + (isLightning ? 0.55 : 1.05), 1.2, 98 - labelWidth);
  const labelYOffset = isLightning ? 1.15 : [-3.5, 2.6, -4.2, 3.4, -2.5, 3.8, -4.8][index % 7];
  const labelY = clamp(point.y + labelYOffset, 1.5, 52.2);
  const radians = (heading * Math.PI) / 180;
  const back = kind === "blackbird" ? 6.4 : kind === "rotor" ? 3.2 : 5.1;
  const tail = { x: point.x - Math.cos(radians) * back, y: point.y - Math.sin(radians) * back };
  const wing = { x: Math.cos(radians + Math.PI / 2) * 0.68, y: Math.sin(radians + Math.PI / 2) * 0.68 };

  return (
    <g className="aircraft-marker">
      <g className="contrail-group" opacity={kind === "rotor" ? 0.18 : 0.52}>
        <path className="contrail contrail-core" d={`M ${tail.x} ${tail.y} C ${(tail.x + point.x) / 2} ${(tail.y + point.y) / 2 - 0.8}, ${point.x - Math.cos(radians) * 1.9} ${point.y - Math.sin(radians) * 1.9}, ${point.x} ${point.y}`} stroke={tint.line} />
        <path className="contrail" d={`M ${tail.x + wing.x} ${tail.y + wing.y} C ${(tail.x + point.x) / 2 + wing.x * 0.25} ${(tail.y + point.y) / 2 + wing.y * 0.25}, ${point.x - Math.cos(radians) * 2.2} ${point.y - Math.sin(radians) * 2.2}, ${point.x} ${point.y}`} stroke={tint.line} />
        <path className="contrail" d={`M ${tail.x - wing.x} ${tail.y - wing.y} C ${(tail.x + point.x) / 2 - wing.x * 0.25} ${(tail.y + point.y) / 2 - wing.y * 0.25}, ${point.x - Math.cos(radians) * 2.2} ${point.y - Math.sin(radians) * 2.2}, ${point.x} ${point.y}`} stroke={tint.line} />
      </g>
      {renderUnit && (
        <>
          <ellipse className="aircraft-shadow" cx={point.x - 0.12} cy={point.y + 0.52} rx={kind === "blackbird" ? 0.9 : 0.62} ry="0.16" />
          <g transform={`translate(${point.x} ${point.y}) rotate(${heading}) scale(${scale})`}>
            <AircraftSilhouette color={tint.line} force={flight.force} kind={kind} />
          </g>
        </>
      )}
      {showLabel && (
        <g className="map-label aircraft-map-label">
          <line x1={point.x} x2={labelX + (flight.force === "red" ? labelWidth : 0)} y1={point.y} y2={labelY + 1.35} stroke={tint.line} strokeOpacity="0.34" strokeWidth="0.09" />
          <rect x={labelX} y={labelY} width={labelWidth} height="2.18" rx="0.28" fill="rgba(1,8,15,0.72)" stroke={tint.line} strokeOpacity="0.36" strokeWidth="0.08" />
          <text x={labelX + 0.42} y={labelY + 0.92} fill="#f3fbff" fontSize="0.6" fontWeight="800">
            {aircraftLabel}
          </text>
          <text x={labelX + 0.42} y={labelY + 1.72} fill={tint.line} fontSize="0.46" fontWeight="800">
            {aircraftBadge(flight.model)} / {friendlyAirRole(flight.role)}
          </text>
        </g>
      )}
    </g>
  );
}

function AircraftSilhouette({ color, force, kind }: { color: string; force: ForceId; kind: string }) {
  const skin = force === "blue" ? "#87ddff" : "#ff785f";
  const mid = force === "blue" ? "#e7fbff" : "#ffd4c7";
  const dark = force === "blue" ? "#06283a" : "#3b120f";
  const glass = force === "blue" ? "#f7ffff" : "#fff3ec";

  if (kind === "blackbird") {
    return (
      <g>
        <path d="M 5.55 0 C 2.48 -0.38, -0.9 -0.58, -4.92 -0.92 C -5.72 -0.62, -5.88 0.62, -4.92 0.92 C -0.9 0.58, 2.48 0.38, 5.55 0 Z" fill={dark} stroke={color} strokeWidth="0.22" />
        <path d="M 0.55 -0.08 L -3.42 -3.1 C -2.72 -1.4, -2.08 -0.48, -1.05 -0.12 Z" fill={mid} opacity="0.42" stroke={color} strokeOpacity="0.5" strokeWidth="0.08" />
        <path d="M 0.55 0.08 L -3.42 3.1 C -2.72 1.4, -2.08 0.48, -1.05 0.12 Z" fill={mid} opacity="0.42" stroke={color} strokeOpacity="0.5" strokeWidth="0.08" />
        <path d="M -3.5 -0.68 L -4.9 -2.1 L -4.35 -0.56 Z" fill={skin} opacity="0.68" />
        <path d="M -3.5 0.68 L -4.9 2.1 L -4.35 0.56 Z" fill={skin} opacity="0.68" />
        <path d="M 1.55 -0.16 L 2.42 0 L 1.55 0.16" fill={glass} opacity="0.78" />
        <path className="afterburner" d="M -5.28 -0.22 C -6.22 -0.06, -6.22 0.06, -5.28 0.22" fill={force === "blue" ? "#9befff" : "#ffd1a2"} />
      </g>
    );
  }

  if (kind === "hawkeye") {
    return (
      <g>
        <ellipse cx="-0.45" cy="-1.42" fill="rgba(232,244,248,0.18)" rx="2.48" ry="0.56" stroke={color} strokeWidth="0.16" />
        <path d="M 3.88 0 C 1.2 -0.6, -1.75 -0.88, -3.62 -0.52 C -4.15 -0.28, -4.15 0.28, -3.62 0.52 C -1.75 0.88, 1.2 0.6, 3.88 0 Z" fill={skin} stroke={color} strokeWidth="0.18" />
        <path d="M -0.28 -0.04 L -3.58 -2.2 C -2.72 -0.9, -1.68 -0.38, -0.28 -0.04 Z" fill={mid} opacity="0.48" />
        <path d="M -0.28 0.04 L -3.58 2.2 C -2.72 0.9, -1.68 0.38, -0.28 0.04 Z" fill={mid} opacity="0.48" />
        <path d="M -3.15 -0.46 L -4.3 -1.2 L -4.02 -0.28 Z M -3.15 0.46 L -4.3 1.2 L -4.02 0.28 Z" fill={dark} opacity="0.74" />
        <path d="M 1.2 -0.13 L 1.85 0 L 1.2 0.13" fill={glass} opacity="0.78" />
      </g>
    );
  }

  if (kind === "rotor") {
    return (
      <g>
        <ellipse className="rotor-disc" cx="0" cy="0" fill="rgba(232,244,248,0.05)" rx="3.95" ry="0.46" stroke={color} strokeOpacity="0.52" strokeWidth="0.13" />
        <path d="M 3.04 0 C 1.02 -0.54, -1.42 -0.72, -2.82 -0.36 C -3.22 -0.12, -3.22 0.12, -2.82 0.36 C -1.42 0.72, 1.02 0.54, 3.04 0 Z" fill={skin} stroke={color} strokeWidth="0.18" />
        <path d="M -2.55 0 L -4.08 0.98 M -2.55 0 L -4.08 -0.98" stroke={color} strokeOpacity="0.74" strokeWidth="0.14" />
        <path d="M 1.35 -0.12 L 2.05 0 L 1.35 0.12" fill={glass} opacity="0.8" />
      </g>
    );
  }

  if (kind === "uav") {
    return (
      <g>
        <path d="M 3.38 0 C 1.62 -0.34, -1.42 -0.52, -3.42 -0.22 C -3.82 -0.08, -3.82 0.08, -3.42 0.22 C -1.42 0.52, 1.62 0.34, 3.38 0 Z" fill={skin} stroke={color} strokeWidth="0.16" />
        <path d="M -0.25 0 L -3.65 -2.68 C -2.88 -0.92, -1.58 -0.25, -0.25 0 Z" fill={mid} opacity="0.48" />
        <path d="M -0.25 0 L -3.65 2.68 C -2.88 0.92, -1.58 0.25, -0.25 0 Z" fill={mid} opacity="0.48" />
        <path d="M -2.7 0 L -4.25 -0.88 L -3.92 0 L -4.25 0.88 Z" fill={dark} opacity="0.68" />
      </g>
    );
  }

  if (kind === "flanker") {
    return (
      <g>
        <path d="M 4.42 0 C 2.32 -0.38, 0.18 -0.48, -2.95 -0.34 L -4.25 0 L -2.95 0.34 C 0.18 0.48, 2.32 0.38, 4.42 0 Z" fill={skin} stroke={color} strokeWidth="0.18" />
        <path d="M 0.15 -0.08 L -2.32 -2.62 L -1.62 -0.38 Z" fill={mid} opacity="0.58" stroke={color} strokeOpacity="0.42" strokeWidth="0.08" />
        <path d="M 0.15 0.08 L -2.32 2.62 L -1.62 0.38 Z" fill={mid} opacity="0.58" stroke={color} strokeOpacity="0.42" strokeWidth="0.08" />
        <path d="M -2.5 -0.3 L -3.72 -1.8 L -3.25 -0.22 Z" fill={dark} opacity="0.82" />
        <path d="M -2.5 0.3 L -3.72 1.8 L -3.25 0.22 Z" fill={dark} opacity="0.82" />
        <path d="M 1.72 -0.14 L 2.46 0 L 1.72 0.14" fill={glass} opacity="0.78" />
        <path className="afterburner" d="M -4.02 -0.25 C -4.92 -0.04, -4.92 0.04, -4.02 0.25" fill="#ffd1a2" />
      </g>
    );
  }

  return (
    <g>
      <path d="M 4.18 0 C 2.18 -0.42, 0.1 -0.52, -3.08 -0.32 L -4.08 0 L -3.08 0.32 C 0.1 0.52, 2.18 0.42, 4.18 0 Z" fill={skin} stroke={color} strokeWidth="0.18" />
      <path d="M 0.06 -0.04 L -2.82 -2.42 C -2.05 -0.76, -1.08 -0.26, 0.06 -0.04 Z" fill={mid} opacity="0.56" stroke={color} strokeOpacity="0.42" strokeWidth="0.08" />
      <path d="M 0.06 0.04 L -2.82 2.42 C -2.05 0.76, -1.08 0.26, 0.06 0.04 Z" fill={mid} opacity="0.56" stroke={color} strokeOpacity="0.42" strokeWidth="0.08" />
      <path d="M -2.78 -0.28 L -3.82 -1.55 L -3.42 -0.18 Z" fill={dark} opacity="0.78" />
      <path d="M -2.78 0.28 L -3.82 1.55 L -3.42 0.18 Z" fill={dark} opacity="0.78" />
      <path d="M 1.55 -0.14 L 2.25 0 L 1.55 0.14" fill={glass} opacity="0.78" />
      <path className="afterburner" d="M -3.9 -0.25 C -4.78 -0.04, -4.78 0.04, -3.9 0.25" fill={force === "blue" ? "#9befff" : "#ffd1a2"} />
    </g>
  );
}

function CommandWorkspace({
  activeTab,
  blueForce,
  commandFeed,
  fleetPosture,
  fleetSettings,
  missionSettings,
  onFleetPosture,
  onFleetSettings,
  onIssueCommand,
  onMissionSettings,
  onResetScenario,
  onTabChange,
  redForce,
  simMinutes,
  visibleEvents
}: {
  activeTab: Exclude<ActiveTab, "Simulation">;
  blueForce: Force;
  commandFeed: string[];
  fleetPosture: (typeof fleetActions)[number];
  fleetSettings: FleetSettings;
  missionSettings: MissionSettings;
  onFleetPosture: (posture: (typeof fleetActions)[number]) => void;
  onFleetSettings: (settings: FleetSettings | ((settings: FleetSettings) => FleetSettings)) => void;
  onIssueCommand: (message: string) => void;
  onMissionSettings: (settings: MissionSettings | ((settings: MissionSettings) => MissionSettings)) => void;
  onResetScenario: () => void;
  onTabChange: (tab: ActiveTab) => void;
  redForce: Force;
  simMinutes: number;
  visibleEvents: ScenarioEvent[];
}) {
  if (activeTab === "Mission") {
    return (
      <div className="terminal-workspace">
        <TerminalHeader icon={<ClipboardList />} kicker="Mission" title="Player Mission Control" status={`Plan: ${missionSettings.name}`} />
        <div className="grid min-h-0 flex-1 grid-cols-[1.05fr_1fr_0.9fr] gap-3">
          <div className="terminal-card">
            <SectionHeader icon={<Target />} title="Target Goals" />
            <div className="space-y-2">
              {missionObjectives.map((objective, index) => (
                <div className="terminal-row" key={objective}>
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded border border-blueforce/30 bg-blueforce/10 text-xs font-bold text-blueforce">{index + 1}</span>
                  <span>{objective}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <IntelTile label="Launch window" value={`${missionSettings.launchDelay} min`} tone="blue" />
              <IntelTile label="Safe range" value={`${missionSettings.engagementRange} nm`} tone="green" />
            </div>
          </div>

          <div className="terminal-card">
            <SectionHeader icon={<Compass />} title="User Inputs" />
            <div className="grid grid-cols-2 gap-3">
              <FieldInput label="Mission name" value={missionSettings.name} onChange={(value) => onMissionSettings((current) => ({ ...current, name: value }))} />
              <NumberInput label="Patrol ring on map" suffix="nm" value={missionSettings.patrolRadius} min={70} max={220} onChange={(value) => onMissionSettings((current) => ({ ...current, patrolRadius: value }))} />
              <NumberInput label="Engage inside" suffix="nm" value={missionSettings.engagementRange} min={30} max={140} onChange={(value) => onMissionSettings((current) => ({ ...current, engagementRange: value }))} />
              <NumberInput label="Aircraft launch delay" suffix="min" value={missionSettings.launchDelay} min={0} max={18} onChange={(value) => onMissionSettings((current) => ({ ...current, launchDelay: value }))} />
            </div>
            <label className="terminal-input-label mt-3 block">
              <span>Commander notes</span>
              <textarea className="terminal-input min-h-24 resize-none" value={missionSettings.intent} onChange={(event) => onMissionSettings((current) => ({ ...current, intent: event.target.value }))} />
            </label>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <CommandButton label="Update Map" onClick={() => { onIssueCommand(`${missionSettings.name} is live on the map: ${missionSettings.patrolRadius} nm patrol area, fire inside ${missionSettings.engagementRange} nm`); onTabChange("Simulation"); }} />
              <CommandButton label="Launch Blackbird" onClick={() => { onMissionSettings((current) => ({ ...current, launchDelay: 0, patrolRadius: clamp(Math.max(current.patrolRadius, 190), 70, 220) })); onIssueCommand("SR-71 Blackbird launched: wider scouting route shown on the map"); onTabChange("Simulation"); }} />
            </div>
          </div>

          <div className="terminal-card">
            <SectionHeader icon={<Gauge />} title="Activity Feed" />
            <div className="space-y-2">
              {commandFeed.map((line) => (
                <div className="terminal-feed" key={line}>{line}</div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (activeTab === "Setup") {
    return (
      <div className="terminal-workspace">
        <TerminalHeader icon={<Wrench />} kicker="Setup" title="Player Setup Controls" status={`Layout: ${fleetPosture}`} />
        <div className="grid min-h-0 flex-1 grid-cols-[0.8fr_1.15fr_1fr] gap-3">
          <div className="terminal-card">
            <SectionHeader icon={<Shield />} title="Layout" />
            <div className="space-y-2">
              {fleetActions.map((action) => (
                <button className={`terminal-select ${fleetPosture === action ? "terminal-select-active" : ""}`} key={action} onClick={() => { onFleetPosture(action); onIssueCommand(`${action} selected for the fleet`); }}>
                  {action}
                </button>
              ))}
            </div>
          </div>

          <div className="terminal-card">
            <SectionHeader icon={<Anchor />} title="User Inputs" />
            <div className="grid grid-cols-2 gap-3">
              <NumberInput label="Airforce" suffix="squadrons" value={fleetSettings.fighterFlights} min={1} max={8} onChange={(value) => onFleetSettings((current) => ({ ...current, fighterFlights: value }))} />
              <NumberInput label="Fighter Jets" suffix="jets" value={fleetSettings.strikeJets} min={4} max={24} onChange={(value) => onFleetSettings((current) => ({ ...current, strikeJets: value }))} />
              <NumberInput label="Nuclear Missiles" suffix="%" value={fleetSettings.missileReserve} min={20} max={95} onChange={(value) => onFleetSettings((current) => ({ ...current, missileReserve: value }))} />
              <NumberInput label="Map Spacing" suffix="nm" value={fleetSettings.screenSpacing} min={12} max={48} onChange={(value) => onFleetSettings((current) => ({ ...current, screenSpacing: value }))} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <ReadinessBar label="Air Cover" value={clamp(fleetSettings.fighterFlights * 12, 20, 96)} />
              <ReadinessBar label="Strike Power" value={clamp(fleetSettings.strikeJets * 4, 20, 96)} />
              <ReadinessBar label="Missile Supply" value={fleetSettings.missileReserve} />
              <ReadinessBar label="Dispersion Ratio" value={clamp(fleetSettings.screenSpacing * 2, 16, 92)} />
            </div>
          </div>

          <div className="terminal-card">
            <SectionHeader icon={<Radio />} title="Status" />
            <StatusLine label="Island Map" value="Connected" />
            <StatusLine label="Enemy ID" value="Confirmed" />
            <StatusLine label="Satellite Link" value="Encrypted" />
            <StatusLine label="User Control" value="Enabled" tone="blue" />
            <div className="mt-3 grid grid-cols-1 gap-2">
              <CommandButton label="Ready for Action" onClick={() => { onFleetSettings((current) => ({ ...current, fighterFlights: clamp(current.fighterFlights + 1, 1, 8), strikeJets: clamp(current.strikeJets + 4, 4, 24), missileReserve: clamp(current.missileReserve - 3, 20, 95) })); onIssueCommand("More Super Hornets ready: aircraft pace and missile reserve updated on the map"); onTabChange("Simulation"); }} />
              <CommandButton label="Update Map" onClick={() => { onIssueCommand(`Fleet spacing set to ${fleetSettings.screenSpacing} nautical miles and shown on the map`); onTabChange("Simulation"); }} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="terminal-workspace">
      <TerminalHeader icon={<FileText />} kicker="Results" title="Mission Summary" status={`Clock: ${formatMissionTime(simMinutes)}`} />
      <div className="grid min-h-0 flex-1 grid-cols-[0.9fr_1.1fr_0.9fr] gap-3">
        <div className="terminal-card">
          <SectionHeader icon={<ShieldCheck />} title="Outcome" />
          <ReadinessBar label={blueForce.taskForce} value={strengthFor(blueForce, simMinutes)} />
          <ReadinessBar label={redForce.taskForce} value={strengthFor(redForce, simMinutes)} tone="red" />
          <div className="mt-3 grid grid-cols-2 gap-3">
            <IntelTile label="Flights launched" value="34" tone="blue" />
            <IntelTile label="Interceptions" value="7" tone="red" />
          </div>
        </div>
        <div className="terminal-card">
          <SectionHeader icon={<TimerReset />} title="Mission Timeline" />
          <div className="space-y-2">
            {visibleEvents.map((event) => (
              <div className="terminal-row" key={`${event.time}-${event.message}`}>
                <span className={event.force === "blue" ? "text-blueforce" : "text-redforce"}>{event.time}</span>
                <span>{friendlyEventMessage(event.message)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="terminal-card">
          <SectionHeader icon={<Cpu />} title="Recommendations" />
          <StatusLine label="Next Step" value="Keep fighter cover close" />
          <StatusLine label="Main Risk" value="Opponent's missile range" tone="red" />
          <StatusLine label="Opening" value="Aircraft launch cycles" tone="blue" />
          <div className="mt-3 grid grid-cols-1 gap-2">
            <CommandButton label="Replay Simulation" onClick={onResetScenario} />
            <CommandButton label="Return To Map" onClick={() => onTabChange("Simulation")} />
          </div>
        </div>
      </div>
    </div>
  );
}

function TerminalHeader({ icon, kicker, status, title }: { icon: ReactNode; kicker: string; status: string; title: string }) {
  return (
    <div className="terminal-header">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded border border-blueforce/30 bg-blueforce/10 text-blueforce [&>svg]:h-5 [&>svg]:w-5">{icon}</span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blueforce">{kicker}</p>
          <h2 className="text-xl font-semibold text-white">{title}</h2>
        </div>
      </div>
      <div className="rounded border border-cyan-100/15 bg-white/5 px-3 py-2 text-xs font-semibold uppercase text-slate-300">{status}</div>
    </div>
  );
}

function FieldInput({ label, onChange, value }: { label: string; onChange: (value: string) => void; value: string }) {
  return (
    <label className="terminal-input-label">
      <span>{label}</span>
      <input className="terminal-input" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function NumberInput({ label, max, min, onChange, suffix, value }: { label: string; max: number; min: number; onChange: (value: number) => void; suffix: string; value: number }) {
  return (
    <label className="terminal-input-label">
      <span>{label}</span>
      <div className="flex items-center gap-2 rounded border border-cyan-100/10 bg-slate-950/45 px-2 py-1.5">
        <input
          className="w-full bg-transparent text-sm font-semibold text-slate-100 outline-none"
          max={max}
          min={min}
          type="number"
          value={value}
          onChange={(event) => onChange(clamp(Number(event.target.value), min, max))}
        />
        <span className="shrink-0 text-[10px] uppercase text-slate-500">{suffix}</span>
      </div>
    </label>
  );
}

function IntelTile({ label, tone = "blue", value }: { label: string; tone?: "blue" | "red" | "green"; value: string }) {
  const toneClass = tone === "red" ? "text-redforce" : tone === "green" ? "text-emerald-300" : "text-blueforce";
  return (
    <div className="rounded border border-cyan-100/10 bg-white/5 p-3">
      <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className={`mt-1 text-lg font-semibold ${toneClass}`}>{value}</div>
    </div>
  );
}

function CommandButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button className="rounded border border-blueforce/25 bg-blueforce/10 px-3 py-2 text-xs font-bold uppercase text-blueforce transition hover:bg-blueforce/20" onClick={onClick}>
      {label}
    </button>
  );
}

function ReadinessBar({ label, tone = "blue", value }: { label: string; tone?: "blue" | "red"; value: number }) {
  return (
    <div className="rounded border border-cyan-100/10 bg-white/5 p-3">
      <div className="mb-2 flex items-center justify-between text-xs">
        <span className="font-semibold text-slate-200">{label}</span>
        <span className={tone === "red" ? "text-redforce" : "text-blueforce"}>{value}%</span>
      </div>
      <div className="h-2 rounded-full bg-slate-950/70">
        <div className={tone === "red" ? "h-full rounded-full bg-redforce" : "h-full rounded-full bg-blueforce"} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function StatusLine({ label, tone = "blue", value }: { label: string; tone?: "blue" | "red"; value: string }) {
  return (
    <div className="mb-2 flex items-center justify-between rounded border border-cyan-100/10 bg-white/5 px-3 py-2 text-xs">
      <span className="uppercase tracking-[0.14em] text-slate-500">{label}</span>
      <span className={tone === "red" ? "font-semibold text-redforce" : "font-semibold text-slate-100"}>{value}</span>
    </div>
  );
}

function BottomDeck({
  aircraft,
  camera,
  cameraLock,
  cameraMode,
  events,
  fleetPosture,
  fleetSettings,
  missionSettings,
  onCameraChange,
  onCameraLock,
  onCameraMode,
  onResetCamera,
  onViewOption,
  ships,
  simMinutes,
  viewOptions,
  weather
}: {
  aircraft: AircraftUnit[];
  camera: CameraState;
  cameraLock: CameraLock;
  cameraMode: CameraMode;
  events: ScenarioEvent[];
  fleetPosture: (typeof fleetActions)[number];
  fleetSettings: FleetSettings;
  missionSettings: MissionSettings;
  onCameraChange: (camera: CameraState | ((camera: CameraState) => CameraState)) => void;
  onCameraLock: (mode: CameraLock) => void;
  onCameraMode: (mode: CameraMode) => void;
  onResetCamera: () => void;
  onViewOption: (key: keyof ViewOptions) => void;
  ships: ShipUnit[];
  simMinutes: number;
  viewOptions: ViewOptions;
  weather: DashboardData["weather"];
}) {
  return (
    <div className="bottom-deck grid min-h-[10.75rem] grid-cols-[0.92fr_0.96fr_1.36fr_0.9fr_1.86fr] gap-3">
      <WeatherPanel weather={weather} />
      <CameraPanel
        camera={camera}
        cameraLock={cameraLock}
        cameraMode={cameraMode}
        onCameraChange={onCameraChange}
        onCameraLock={onCameraLock}
        onCameraMode={onCameraMode}
        onResetCamera={onResetCamera}
      />
      <MinimapPanel aircraft={aircraft} fleetPosture={fleetPosture} fleetSettings={fleetSettings} missionSettings={missionSettings} ships={ships} simMinutes={simMinutes} />
      <ViewOptionsPanel options={viewOptions} onToggle={onViewOption} />
      <EventLogPanel events={events} />
    </div>
  );
}

function SectionHeader({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-slate-400">
      <span className="h-4 w-4 text-blueforce [&>svg]:h-4 [&>svg]:w-4">{icon}</span>
      {title}
    </div>
  );
}

function WeatherGlyph() {
  return (
    <svg className="weather-glyph" viewBox="0 0 72 72" aria-hidden="true">
      <defs>
        <radialGradient id="weatherSun" cx="42%" cy="38%" r="45%">
          <stop offset="0%" stopColor="#fff4b8" />
          <stop offset="100%" stopColor="#ffb547" />
        </radialGradient>
        <linearGradient id="weatherCloud" x1="0%" x2="100%" y1="0%" y2="100%">
          <stop offset="0%" stopColor="#f4fbff" />
          <stop offset="100%" stopColor="#9aa7b1" />
        </linearGradient>
      </defs>
      <g opacity="0.95">
        <circle cx="24" cy="25" r="12" fill="url(#weatherSun)" />
        {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => (
          <line key={angle} x1="24" x2="24" y1="6" y2="13" stroke="#ffc65e" strokeLinecap="round" strokeWidth="3" transform={`rotate(${angle} 24 25)`} />
        ))}
        <path d="M 22 53 C 13 53, 9 47, 12 41 C 14 36, 18 34, 23 35 C 26 27, 38 25, 44 32 C 50 32, 58 37, 58 45 C 58 51, 53 55, 45 55 L 22 55 Z" fill="url(#weatherCloud)" stroke="#e8f7ff" strokeOpacity="0.72" strokeWidth="1.4" />
        <path d="M 28 61 L 24 67 M 42 61 L 38 67 M 54 60 L 50 66" stroke="#9ddcff" strokeLinecap="round" strokeWidth="2.2" />
      </g>
    </svg>
  );
}

function WeatherPanel({ weather }: { weather: DashboardData["weather"] }) {
  return (
    <div className="glass-panel min-h-0 p-3">
      <SectionHeader icon={<Activity />} title="Weather" />
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-white">{weather.condition}</p>
          <p className="text-[11px] text-slate-400">Updated {weather.updatedAt}</p>
        </div>
        <WeatherGlyph />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <Metric label="Wind" value={`${weather.windKts} kts`} />
        <Metric label="Visibility" value={weather.visibility} />
        <Metric label="Sea Intensity" value={weather.seaState} />
        <Metric label="Cloud Base" value={`${weather.cloudBaseFt} ft`} />
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-cyan-100/10 bg-white/5 px-2 py-1.5">
      <div className="text-[10px] uppercase text-slate-500">{label}</div>
      <div className="mt-0.5 font-semibold text-slate-100">{value}</div>
    </div>
  );
}

function CameraPanel({
  camera,
  cameraLock,
  cameraMode,
  onCameraChange,
  onCameraLock,
  onCameraMode,
  onResetCamera
}: {
  camera: CameraState;
  cameraLock: CameraLock;
  cameraMode: CameraMode;
  onCameraChange: (camera: CameraState | ((camera: CameraState) => CameraState)) => void;
  onCameraLock: (mode: CameraLock) => void;
  onCameraMode: (mode: CameraMode) => void;
  onResetCamera: () => void;
}) {
  return (
    <div className="glass-panel min-h-0 p-3">
      <SectionHeader icon={<SlidersHorizontal />} title="Camera" />
      <div className="grid grid-cols-2 gap-2">
        <ControlButton active={cameraMode === "2d"} label="2D" onClick={() => onCameraMode("2d")} />
        <ControlButton active={cameraMode === "3d"} label="3D" onClick={() => onCameraMode("3d")} />
        <ControlButton active={cameraLock === "follow"} label="Follow" onClick={() => onCameraLock("follow")} />
        <ControlButton active={cameraLock === "free"} label="Free" onClick={() => onCameraLock("free")} />
      </div>
      <div className="mt-3 flex items-center justify-between rounded border border-cyan-100/10 bg-white/5 px-2 py-1.5">
        <button className="grid h-7 w-7 place-items-center rounded bg-slate-950/50 text-slate-200 hover:text-blueforce" onClick={() => onCameraChange((value) => ({ ...value, zoom: clamp(value.zoom - 0.08, 0.74, 1.48) }))} title="Zoom out">
          <ZoomOut className="h-4 w-4" />
        </button>
        <span className="text-xs font-semibold text-slate-200">{Math.round(camera.zoom * 100)}%</span>
        <button className="grid h-7 w-7 place-items-center rounded bg-slate-950/50 text-slate-200 hover:text-blueforce" onClick={() => onCameraChange((value) => ({ ...value, zoom: clamp(value.zoom + 0.08, 0.74, 1.48) }))} title="Zoom in">
          <ZoomIn className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <button className="camera-icon-button" onClick={() => onCameraChange((value) => ({ ...value, yaw: clamp(value.yaw - 5, -18, 18) }))} title="Rotate left">
          <RotateCcw className="h-4 w-4" />
        </button>
        <button className="camera-icon-button" onClick={onResetCamera} title="Reset camera">
          <LocateFixed className="h-4 w-4" />
        </button>
        <button className="camera-icon-button" onClick={() => onCameraChange((value) => ({ ...value, yaw: clamp(value.yaw + 5, -18, 18) }))} title="Rotate right">
          <RotateCw className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function ControlButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      className={`rounded border px-2 py-2 text-xs font-semibold uppercase transition ${
        active ? "border-blueforce/45 bg-blueforce/15 text-blueforce" : "border-cyan-100/10 bg-white/5 text-slate-300 hover:border-cyan-100/25"
      }`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function MinimapPanel({
  aircraft,
  fleetPosture,
  fleetSettings,
  missionSettings,
  ships,
  simMinutes
}: {
  aircraft: AircraftUnit[];
  fleetPosture: (typeof fleetActions)[number];
  fleetSettings: FleetSettings;
  missionSettings: MissionSettings;
  ships: ShipUnit[];
  simMinutes: number;
}) {
  const shipStates = ships.map((ship, index) => ({ ship, ...shipState(ship, simMinutes, index, fleetSettings, fleetPosture) }));
  const blueCarrierState = shipStates.find(({ ship }) => ship.id === "blue-cvn-78");

  return (
    <div className="glass-panel min-h-0 p-3">
      <SectionHeader icon={<MapIcon />} title="Minimap" />
      <svg className="h-[7.1rem] w-full rounded border border-cyan-100/10 bg-[#03111d]" viewBox="0 0 100 56.25" preserveAspectRatio="none">
        <defs>
          <linearGradient id="miniOcean" x1="0%" x2="100%" y1="0%" y2="100%">
            <stop offset="0%" stopColor="#173646" />
            <stop offset="100%" stopColor="#04111d" />
          </linearGradient>
        </defs>
        <rect width="100" height="56.25" fill="url(#miniOcean)" />
        <path d="M 41 25 C 47 20, 57 22, 62 29 C 56 36, 45 35, 41 25 Z" fill="#24442d" opacity="0.72" />
        <path d="M 5 5 C 10 1, 18 2, 23 8 C 17 13, 8 13, 5 5 Z" fill="#24442d" opacity="0.48" />
        <path d="M 73 9 C 80 5, 92 7, 96 14 C 87 18, 77 16, 73 9 Z" fill="#24442d" opacity="0.48" />
        {shipStates.map(({ heading, point, ship }) => {
          const scale = ship.type === "carrier" ? 0.38 : 0.28;
          const visualHeading = 0;
          const visualScaleX = ship.force === "red" ? -scale : scale;
          return (
            <g key={ship.id} opacity="0.95" transform={`translate(${point.x} ${point.y}) rotate(${visualHeading}) scale(${visualScaleX} ${scale})`}>
              <ShipSilhouette color={forceTint[ship.force].line} type={ship.type} />
            </g>
          );
        })}
        {aircraft.map((flight, index) => {
          const path = adjustedAircraftPath(flight, missionSettings, fleetSettings, fleetPosture);
          const phase = aircraftPhase(flight, index, simMinutes, missionSettings, fleetSettings);
          const wrappedPhase = phase % 1;
          const normalizedPhase = wrappedPhase < 0 ? wrappedPhase + 1 : wrappedPhase;
          if (normalizedPhase < 0.03 || normalizedPhase > 0.965) return null;
          const point = cubicAt(path, normalizedPhase);
          const nextPhase = Math.min(normalizedPhase + 0.012, 0.965);
          const nextPoint = cubicAt(path, nextPhase);
          const heading = (Math.atan2(nextPoint.y - point.y, nextPoint.x - point.x) * 180) / Math.PI;
          return (
            <g key={flight.id} transform={`translate(${point.x} ${point.y}) rotate(${heading}) scale(0.34)`}>
              <AircraftSilhouette color={forceTint[flight.force].line} force={flight.force} kind={aircraftKind(flight)} />
            </g>
          );
        })}
        <rect fill="none" height="27" stroke="#e5f7ff" strokeDasharray="1 1" strokeOpacity="0.68" strokeWidth="0.48" width="38" x="31" y="15" />
      </svg>
    </div>
  );
}

function ViewOptionsPanel({ onToggle, options }: { onToggle: (key: keyof ViewOptions) => void; options: ViewOptions }) {
  return (
    <div className="glass-panel min-h-0 p-3">
      <SectionHeader icon={<Crosshair />} title="Overlays" />
      <div className="space-y-1.5">
        {viewLabels.map(({ key, label }) => (
          <label className="flex cursor-pointer items-center justify-between gap-2 rounded border border-cyan-100/10 bg-white/5 px-2 py-1.5 text-xs leading-tight text-slate-200" key={key}>
            <span className="min-w-0 leading-tight">{label}</span>
            <input
              checked={options[key]}
              className="h-4 w-4 accent-cyan-300"
              onChange={() => onToggle(key)}
              type="checkbox"
            />
          </label>
        ))}
      </div>
    </div>
  );
}

function EventLogPanel({ events }: { events: ScenarioEvent[] }) {
  return (
    <div className="glass-panel min-h-0 p-3">
      <SectionHeader icon={<Gauge />} title="Event Log" />
      <div className="event-scroll max-h-[10.1rem] space-y-1.5 overflow-y-auto pr-1">
        {events.map((event) => (
          <div className="event-line" key={`${event.time}-${event.message}`}>
            <span className={event.force === "blue" ? "text-blueforce" : "text-redforce"}>{event.time}</span>
            <span className="min-w-0 break-words leading-snug text-slate-200">{friendlyEventMessage(event.message)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CommandModal({
  modal,
  onClose,
  onSetSpeed,
  onShowResults,
  onToggleOption,
  speed,
  viewOptions
}: {
  modal: Exclude<ModalKind, null>;
  onClose: () => void;
  onSetSpeed: (speed: number) => void;
  onShowResults: () => void;
  onToggleOption: (key: keyof ViewOptions) => void;
  speed: number;
  viewOptions: ViewOptions;
}) {
  const title = modal === "help" ? "Operator Assistance" : modal === "settings" ? "System Settings" : "Simulation Suspended";
  const icon = modal === "help" ? <Headphones /> : modal === "settings" ? <Settings /> : <Power />;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/72 p-6 backdrop-blur-sm">
      <div className="glass-panel w-full max-w-3xl p-4">
        <div className="mb-4 flex items-center justify-between border-b border-cyan-100/10 pb-3">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded border border-blueforce/30 bg-blueforce/10 text-blueforce [&>svg]:h-5 [&>svg]:w-5">{icon}</span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blueforce">SkyStrike Terminal</p>
              <h2 className="text-xl font-semibold text-white">{title}</h2>
            </div>
          </div>
          <button className="grid h-9 w-9 place-items-center rounded border border-cyan-100/10 bg-white/5 text-slate-300 hover:text-white" onClick={onClose} title="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        {modal === "help" && (
          <div className="grid grid-cols-3 gap-3">
            <IntelTile label="Map Control" value="Drag / Wheel" />
            <IntelTile label="Clock Control" value="Play / Pause" />
            <IntelTile label="Combat View" value="Camera + Overlays" />
            <div className="terminal-card col-span-3">
              <SectionHeader icon={<AlertTriangle />} title="Command Notes" />
              <div className="grid grid-cols-3 gap-3 text-sm text-slate-300">
                <p>"Mission" lets you set the plan, ranges, timing, and player notes.</p>
                <p>"Setup" lets you input aircraft sizes, spacing on the map, # of missiles, and launch settings.</p>
                <p>"Results" turns the live timeline into a detailed mission summary and outcome report.</p>
              </div>
            </div>
          </div>
        )}

        {modal === "settings" && (
          <div className="grid grid-cols-[0.9fr_1.1fr] gap-3">
            <div className="terminal-card">
              <SectionHeader icon={<Gauge />} title="Speed" />
              <div className="grid grid-cols-3 gap-2">
                {[1, 2, 4].map((value) => (
                  <button className={`terminal-select ${speed === value ? "terminal-select-active" : ""}`} key={value} onClick={() => onSetSpeed(value)}>
                    x{value}
                  </button>
                ))}
              </div>
            </div>
            <div className="terminal-card">
              <SectionHeader icon={<Radar />} title="Overlays" />
              <div className="grid grid-cols-2 gap-2">
                {viewLabels.map(({ key, label }) => (
                  <label className="flex cursor-pointer items-center justify-between rounded border border-cyan-100/10 bg-white/5 px-2 py-2 text-xs text-slate-200" key={key}>
                    <span>{label.replace("Show ", "")}</span>
                    <input checked={viewOptions[key]} className="h-4 w-4 accent-cyan-300" onChange={() => onToggleOption(key)} type="checkbox" />
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

        {modal === "exit" && (
          <div className="terminal-card">
            <SectionHeader icon={<Power />} title="End Simulation" />
            <p className="text-sm text-slate-300">The live clock is paused and the current mission state is ready for review.</p>
            <div className="mt-4 flex justify-end gap-3">
              <button className="rounded border border-cyan-100/15 bg-white/5 px-4 py-2 text-xs font-bold uppercase text-slate-200 hover:bg-white/10" onClick={onClose}>Return</button>
              <button className="rounded border border-redforce/30 bg-redforce/10 px-4 py-2 text-xs font-bold uppercase text-red-100 hover:bg-redforce/20" onClick={onShowResults}>Open Results</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


export default App;