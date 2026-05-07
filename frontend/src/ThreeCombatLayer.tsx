import { OrthographicCamera } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { type OrthographicCamera as ThreeOrthographicCamera } from "three";
import { ModelUnit } from "./ModelUnit";
import { getAircraftModelClass, getShipModelClass, modelRegistry } from "./modelRegistry";
import type { AircraftUnit, Point, ShipUnit } from "./types";

type ShipRenderState = {
  ship: ShipUnit;
  point: Point;
  heading: number;
};

type AircraftRenderState = {
  flight: AircraftUnit;
  point: Point;
  heading: number;
  index: number;
  key: string;
};

type ThreeCombatLayerProps = {
  aircraftStates: AircraftRenderState[];
  shipStates: ShipRenderState[];
};

const WORLD_SCALE = 0.58;
const CAMERA_POSITION: [number, number, number] = [0, 32, 46];
const CAMERA_TARGET: [number, number, number] = [0, 0.35, 1.4];
const WORLD_CENTER_X = 50;
const WORLD_CENTER_Z = 28.125;

function mapToWorld(point: Point, height = 0): [number, number, number] {
  return [(point.x - WORLD_CENTER_X) * WORLD_SCALE, height, (point.y - WORLD_CENTER_Z) * WORLD_SCALE];
}

function headingToYaw(heading: number, headingSign: 1 | -1 = 1, headingOffset = -Math.PI / 2) {
  return headingSign * ((heading * Math.PI) / 180) + headingOffset;
}

function TacticalCameraRig() {
  const camera = useThree((state) => state.camera as ThreeOrthographicCamera);

  useEffect(() => {
    camera.position.set(...CAMERA_POSITION);
    camera.lookAt(...CAMERA_TARGET);
    camera.zoom = 19.2;
    camera.near = 0.1;
    camera.far = 220;
    camera.updateProjectionMatrix();
  }, [camera]);

  return null;
}

function OceanPlane() {
  return (
    <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.16, 0]}>
      <planeGeometry args={[82, 48, 36, 20]} />
      <meshStandardMaterial color="#164a60" metalness={0.02} roughness={0.88} transparent opacity={0.16} />
    </mesh>
  );
}

function SkyStrikeModels({ aircraftStates, shipStates }: ThreeCombatLayerProps) {
  const shipUnits = useMemo(() => {
    return shipStates.map(({ heading, point, ship }) => {
      const modelClass = getShipModelClass(ship);
      const config = modelRegistry[modelClass];
      const yaw = headingToYaw(heading, config.headingSign, config.headingOffset);
      const rotation: [number, number, number] = [0, yaw, 0];

      return { config, key: ship.id, modelRotationOffset: config.rotationOffset, position: mapToWorld(point, config.heightOffset), rotation, ship };
    });
  }, [shipStates]);

  const aircraftUnits = useMemo(() => {
    return aircraftStates.map(({ flight, heading, index, key, point }) => {
      const modelClass = getAircraftModelClass(flight);
      const config = modelRegistry[modelClass];
      const yaw = headingToYaw(heading, config.headingSign, config.headingOffset);
      const bank = Math.sin((heading + index * 31) * 0.045) * 0.15;
      const rotation: [number, number, number] = [0, yaw, 0];
      const modelRotationOffset: [number, number, number] = [
        config.rotationOffset[0],
        config.rotationOffset[1],
        config.rotationOffset[2] + bank
      ];

      return { config, flight, key, modelRotationOffset, position: mapToWorld(point, config.heightOffset + index * 0.12), rotation };
    });
  }, [aircraftStates]);

  return (
    <>
      {shipUnits.map(({ config, key, modelRotationOffset, position, rotation, ship }) => (
        <ModelUnit
          key={key}
          modelRotationOffset={modelRotationOffset}
          modelUrl={config.modelUrl}
          position={position}
          rotation={rotation}
          scale={config.scale}
          team={ship.force}
          unitType={config.unitType}
        />
      ))}

      {aircraftUnits.map(({ config, flight, key, modelRotationOffset, position, rotation }) => (
        <ModelUnit
          key={key}
          modelRotationOffset={modelRotationOffset}
          modelUrl={config.modelUrl}
          position={position}
          rotation={rotation}
          scale={config.scale}
          team={flight.force}
          unitType={config.unitType}
        />
      ))}
    </>
  );
}

export function ThreeCombatLayer({ aircraftStates, shipStates }: ThreeCombatLayerProps) {
  return (
    <Canvas
      className="three-combat-layer"
      dpr={[1, 1.25]}
      frameloop="demand"
      gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
      onCreated={({ gl }) => {
        gl.setClearColor(0x000000, 0);
        gl.shadowMap.enabled = true;
      }}
      shadows
    >
      <fog attach="fog" args={["#071d2d", 52, 122]} />
      <OrthographicCamera makeDefault position={CAMERA_POSITION} zoom={19.2} near={0.1} far={220} />
      <TacticalCameraRig />
      <ambientLight intensity={0.74} />
      <hemisphereLight args={["#bdefff", "#102b3c", 0.5]} />
      <directionalLight
        castShadow
        intensity={1.65}
        position={[-24, 44, 28]}
        shadow-bias={-0.00018}
        shadow-camera-bottom={-42}
        shadow-camera-far={130}
        shadow-camera-left={-52}
        shadow-camera-right={52}
        shadow-camera-top={42}
        shadow-mapSize-height={1024}
        shadow-mapSize-width={1024}
      />
      <OceanPlane />
      <SkyStrikeModels aircraftStates={aircraftStates} shipStates={shipStates} />
    </Canvas>
  );
}
