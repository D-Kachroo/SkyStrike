import { Html, useGLTF } from "@react-three/drei";
import { Component, Suspense, useMemo, type ReactNode } from "react";
import { Box3, Color, Mesh, Vector3, type Group, type Material } from "three";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { ModelTeam, ModelUnitType } from "./modelRegistry";

type ModelUnitProps = {
  modelUrl: string;
  team: ModelTeam;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: number;
  unitType: ModelUnitType;
  modelRotationOffset?: [number, number, number];
};

type BoundaryProps = {
  children: ReactNode;
  fallback: ReactNode;
};

type BoundaryState = {
  hasError: boolean;
};

class ModelLoadBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

function tintMaterial(material: Material, team: ModelTeam) {
  const cloned = material.clone();
  const mat = cloned as Material & {
    color?: Color;
    emissive?: Color;
    emissiveIntensity?: number;
    roughness?: number;
    metalness?: number;
  };

  const primary = new Color(team === "blue" ? "#1e9bff" : "#ff3b30");
  const secondary = new Color(team === "blue" ? "#38bdf8" : "#fb3b2f");
  const emissive = new Color(team === "blue" ? "#0ea5e9" : "#ef4444");

  if (mat.color instanceof Color) {
    mat.color.lerp(primary, 0.68);
    mat.color.lerp(secondary, 0.18);
  }

  if (mat.emissive instanceof Color) {
    mat.emissive.lerp(emissive, 0.58);
    mat.emissiveIntensity = Math.min(Math.max(mat.emissiveIntensity ?? 0.1, 0.08), 0.16);
  }

  if (typeof mat.roughness === "number") mat.roughness = Math.min(Math.max(mat.roughness, 0.42), 0.88);
  if (typeof mat.metalness === "number") mat.metalness = Math.min(Math.max(mat.metalness, 0.08), 0.72);

  cloned.needsUpdate = true;
  return cloned;
}

function LoadedModel({ modelRotationOffset = [0, 0, 0], modelUrl, position, rotation, scale, team }: ModelUnitProps) {
  const gltf = useGLTF(modelUrl) as unknown as { scene: Group };

  const model = useMemo(() => {
    const cloned = cloneSkeleton(gltf.scene) as Group;

    cloned.traverse((object) => {
      const mesh = object as Mesh;
      if (!mesh.isMesh) return;

      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;

      if (Array.isArray(mesh.material)) {
        mesh.material = mesh.material.map((material) => tintMaterial(material, team));
      } else if (mesh.material) {
        mesh.material = tintMaterial(mesh.material, team);
      }
    });

    const bounds = new Box3().setFromObject(cloned);
    const size = new Vector3();
    const center = new Vector3();
    bounds.getSize(size);
    bounds.getCenter(center);

    const longestSide = Math.max(size.x, size.y, size.z);
    if (Number.isFinite(longestSide) && longestSide > 0) {
      const normalize = 1 / longestSide;
      cloned.scale.setScalar(normalize);
      cloned.position.set(-center.x * normalize, -center.y * normalize, -center.z * normalize);
    }

    return cloned;
  }, [gltf.scene, team]);

  return (
    <group position={position} rotation={rotation} scale={scale}>
      <group rotation={modelRotationOffset}>
        <primitive object={model} />
      </group>
    </group>
  );
}

function FallbackUnit({ modelRotationOffset = [0, 0, 0], position, rotation, scale, team, unitType }: Omit<ModelUnitProps, "modelUrl">) {
  const color = team === "blue" ? "#38bdf8" : "#fb3b2f";
  const glow = team === "blue" ? "rgba(56,189,248,0.5)" : "rgba(251,59,47,0.48)";

  return (
    <group position={position} rotation={rotation} scale={scale}>
      <group rotation={modelRotationOffset}>
        <Html center distanceFactor={unitType === "ship" ? 18 : 12} sprite transform>
        <svg height={unitType === "ship" ? 28 : 22} viewBox="0 0 80 32" width={unitType === "ship" ? 72 : 48} style={{ filter: `drop-shadow(0 0 10px ${glow})` }}>
          {unitType === "ship" ? (
            <g fill={color} stroke="#e8fbff" strokeOpacity="0.72" strokeWidth="1.2">
              <path d="M 8 20 C 19 15, 56 14, 73 19 C 66 27, 21 28, 8 20 Z" />
              <path d="M 31 14 L 46 14 L 52 18 L 24 18 Z" opacity="0.72" />
              <path d="M 40 7 L 43 14 M 43 9 L 50 12" fill="none" />
            </g>
          ) : (
            <g fill={color} stroke="#e8fbff" strokeOpacity="0.72" strokeWidth="1.2">
              <path d="M 70 16 L 42 13 L 17 4 L 25 15 L 7 16 L 25 17 L 17 28 L 42 19 Z" />
              <path d="M 40 12 L 31 6 M 40 20 L 31 26" opacity="0.82" />
            </g>
          )}
        </svg>
        </Html>
      </group>
    </group>
  );
}

export function ModelUnit(props: ModelUnitProps) {
  const fallback = <FallbackUnit modelRotationOffset={props.modelRotationOffset} position={props.position} rotation={props.rotation} scale={props.scale} team={props.team} unitType={props.unitType} />;

  return (
    <ModelLoadBoundary fallback={fallback}>
      <Suspense fallback={fallback}>
        <LoadedModel {...props} />
      </Suspense>
    </ModelLoadBoundary>
  );
}
