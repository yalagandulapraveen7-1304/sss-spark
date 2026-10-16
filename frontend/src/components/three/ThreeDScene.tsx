import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Environment, Lightformer, Html, Grid, RoundedBox } from "@react-three/drei";
import { forwardRef, useImperativeHandle, useMemo, useRef } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitImpl } from "three-stdlib";
import type { SensorId, SensorStatus, CameraView, SceneHandle } from "../../types/threeSimulator";

// Scene palette
export const SENSOR_COLORS: Record<SensorId, string> = {
  A: "#22d3ee",
  B: "#3b82f6",
  C: "#a78bfa"
};

export const STATUS_COLORS: Record<SensorStatus, string> = {
  healthy: "#22c55e",
  warning: "#f59e0b",
  corrected: "#22c55e",
  critical: "#ef4444",
  unknown: "#64748b",
  disconnected: "#64748b",
};

const CAR_LEN = 4.3;
const SENSOR_X: Record<SensorId, number> = { A: -0.62, B: 0, C: 0.62 };

const VIEWS: Record<CameraView, [number, number, number]> = {
  reset: [9, 5.5, 10],
  front: [0, 2.2, 13],
  side: [13, 2.5, 3],
  top: [0.01, 16, 4],
};

function CameraRig({
  target,
  controls
}: {
  target: React.MutableRefObject<THREE.Vector3 | null>;
  controls: React.RefObject<OrbitImpl | null>;
}) {
  const { camera } = useThree();
  useFrame((_, dt) => {
    if (!target.current) return;
    camera.position.lerp(target.current, 1 - Math.exp(-6 * Math.min(dt, 0.05)));
    controls.current?.update();
    if (camera.position.distanceTo(target.current) < 0.05) target.current = null;
  });
  return null;
}

function Wall() {
  const tex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const g = c.getContext("2d")!;
    g.fillStyle = "#3a3f47";
    g.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y += 32) {
      for (let x = (y / 32) % 2 ? -32 : 0; x < 256; x += 64) {
        const v = 58 + Math.random() * 14;
        g.fillStyle = `rgb(${v},${v + 3},${v + 8})`;
        g.fillRect(x + 2, y + 2, 60, 28);
      }
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(4, 1.5);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);

  return (
    <group>
      <mesh position={[0, 1.75, -0.25]} castShadow receiveShadow>
        <boxGeometry args={[9, 3.5, 0.5]} />
        <meshStandardMaterial map={tex} roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.06, 0.02]}>
        <boxGeometry args={[9, 0.12, 0.04]} />
        <meshStandardMaterial color="#f59e0b" roughness={0.6} />
      </mesh>
    </group>
  );
}

function Wheel({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0.36, z]} rotation={[0, 0, Math.PI / 2]}>
      <mesh castShadow>
        <cylinderGeometry args={[0.36, 0.36, 0.26, 28]} />
        <meshStandardMaterial color="#111317" roughness={0.85} />
      </mesh>
      <mesh position={[0, x > 0 ? 0.135 : -0.135, 0]}>
        <cylinderGeometry args={[0.22, 0.22, 0.02, 20]} />
        <meshStandardMaterial color="#9aa3ad" metalness={0.9} roughness={0.3} />
      </mesh>
    </group>
  );
}

function Car({ statuses }: { statuses: Record<SensorId, SensorStatus> }) {
  const paint = (
    <meshPhysicalMaterial
      color="#d7dde4"
      metalness={0.6}
      roughness={0.28}
      clearcoat={1}
      clearcoatRoughness={0.1}
    />
  );
  const glass = (
    <meshPhysicalMaterial
      color="#0b1220"
      metalness={0.2}
      roughness={0.05}
      transmission={0}
      opacity={0.92}
      transparent
    />
  );

  return (
    <group>
      <RoundedBox args={[1.86, 0.62, CAR_LEN]} radius={0.18} position={[0, 0.66, CAR_LEN / 2]} castShadow>
        {paint}
      </RoundedBox>
      <RoundedBox args={[1.6, 0.56, 2.1]} radius={0.22} position={[0, 1.16, CAR_LEN / 2 + 0.25]} castShadow>
        {glass}
      </RoundedBox>
      <RoundedBox args={[1.5, 0.08, 1.7]} radius={0.04} position={[0, 1.45, CAR_LEN / 2 + 0.3]} castShadow>
        {paint}
      </RoundedBox>

      {/* Headlights */}
      {[-0.65, 0.65].map((x) => (
        <mesh key={x} position={[x, 0.78, 0.01]}>
          <boxGeometry args={[0.38, 0.1, 0.04]} />
          <meshStandardMaterial color="#e6f6ff" emissive="#bfe9ff" emissiveIntensity={1.2} />
        </mesh>
      ))}

      {/* Tail lights */}
      {[-0.65, 0.65].map((x) => (
        <mesh key={x} position={[x, 0.8, CAR_LEN - 0.01]}>
          <boxGeometry args={[0.38, 0.1, 0.04]} />
          <meshStandardMaterial color="#7f1d1d" emissive="#ef4444" emissiveIntensity={0.6} />
        </mesh>
      ))}

      {/* Bumper strip */}
      <mesh position={[0, 0.48, 0.02]}>
        <boxGeometry args={[1.7, 0.16, 0.06]} />
        <meshStandardMaterial color="#1f2937" roughness={0.6} />
      </mesh>

      <Wheel x={-0.9} z={0.85} />
      <Wheel x={0.9} z={0.85} />
      <Wheel x={-0.9} z={CAR_LEN - 0.85} />
      <Wheel x={0.9} z={CAR_LEN - 0.85} />

      {/* Ultrasonic sensor mounts */}
      {(Object.keys(SENSOR_X) as SensorId[]).map((id) => (
        <group key={id} position={[SENSOR_X[id], 0.5, -0.02]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.07, 0.07, 0.06, 20]} />
            <meshStandardMaterial color={SENSOR_COLORS[id]} emissive={SENSOR_COLORS[id]} emissiveIntensity={0.8} />
          </mesh>
          <mesh position={[0, 0.13, 0]}>
            <sphereGeometry args={[0.03, 12, 12]} />
            <meshStandardMaterial
              color={STATUS_COLORS[statuses[id] || "healthy"]}
              emissive={STATUS_COLORS[statuses[id] || "healthy"]}
              emissiveIntensity={1.5}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Beams({ distance }: { distance: number }) {
  const mats = useRef<THREE.MeshBasicMaterial[]>([]);
  useFrame(({ clock }) => {
    mats.current.forEach((m, i) => {
      if (m) m.opacity = 0.35 + 0.2 * Math.sin(clock.elapsedTime * 4 + i * 1.3);
    });
  });

  return (
    <>
      {(Object.keys(SENSOR_X) as SensorId[]).map((id, i) => (
        <group key={id}>
          <mesh position={[SENSOR_X[id], 0.5, distance / 2]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.012, 0.012, distance, 6]} />
            <meshBasicMaterial
              ref={(m) => {
                if (m) mats.current[i] = m;
              }}
              color={SENSOR_COLORS[id]}
              transparent
              opacity={0.5}
            />
          </mesh>
          <mesh position={[SENSOR_X[id], 0.5, 0.012]}>
            <circleGeometry args={[0.07, 20]} />
            <meshBasicMaterial color={SENSOR_COLORS[id]} transparent opacity={0.8} />
          </mesh>
        </group>
      ))}
    </>
  );
}

function DistanceIndicator({
  distance,
  backendDistance
}: {
  distance: number;
  backendDistance: number | null;
}) {
  return (
    <group>
      <mesh position={[-1.4, 0.02, distance / 2]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.04, distance]} />
        <meshBasicMaterial color="#e2e8f0" />
      </mesh>
      {[0, distance].map((z) => (
        <mesh key={z} position={[-1.4, 0.02, z]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.4, 0.04]} />
          <meshBasicMaterial color="#e2e8f0" />
        </mesh>
      ))}
      <Html position={[-1.4, 0.5, distance / 2]} center distanceFactor={9} zIndexRange={[10, 0]}>
        <div className="scene-label">
          <span className="scene-label-k">Visual</span> {distance.toFixed(3)} m
          {backendDistance !== null && Math.abs(backendDistance - distance) > 0.005 && (
            <div className="scene-label-sub">Live Sensor {backendDistance.toFixed(3)} m</div>
          )}
        </div>
      </Html>
    </group>
  );
}

function FloorScale() {
  const ticks = Array.from({ length: 11 }, (_, i) => i);
  return (
    <group>
      {ticks.map((m) => (
        <group key={m}>
          <mesh position={[2.6, 0.012, m]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[m % 5 === 0 ? 0.6 : 0.35, 0.03]} />
            <meshBasicMaterial color="#94a3b8" />
          </mesh>
          <Html position={[3.2, 0.02, m]} center distanceFactor={12} zIndexRange={[5, 0]}>
            <span className="scene-tick">{m} m</span>
          </Html>
        </group>
      ))}
      <mesh position={[2.6, 0.011, 5]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.03, 10]} />
        <meshBasicMaterial color="#64748b" />
      </mesh>
    </group>
  );
}

function CarGroup({
  distance,
  statuses
}: {
  distance: number;
  statuses: Record<SensorId, SensorStatus>;
}) {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    if (ref.current) ref.current.position.z = distance;
  });
  return (
    <group ref={ref} position={[0, 0, distance]}>
      <Car statuses={statuses} />
    </group>
  );
}

interface Props {
  distance: number;
  backendDistance: number | null;
  statuses: Record<SensorId, SensorStatus>;
}

export const ThreeDScene = forwardRef<SceneHandle, Props>(function ThreeDScene(
  { distance, backendDistance, statuses },
  ref
) {
  const controls = useRef<OrbitImpl | null>(null);
  const camTarget = useRef<THREE.Vector3 | null>(null);

  useImperativeHandle(ref, () => ({
    setView: (v) => {
      camTarget.current = new THREE.Vector3(...VIEWS[v]);
      controls.current?.target.set(0, 0.8, 3);
    },
  }));

  return (
    <Canvas shadows dpr={[1, 2]} camera={{ position: VIEWS.reset, fov: 45 }}>
      <color attach="background" args={["#0d1117"]} />
      <fog attach="fog" args={["#0d1117", 22, 48]} />
      <ambientLight intensity={0.35} />
      <directionalLight
        position={[8, 12, 9]}
        intensity={2}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-12}
        shadow-camera-right={12}
        shadow-camera-top={12}
        shadow-camera-bottom={-12}
      />
      <Environment resolution={128}>
        <Lightformer intensity={2} position={[0, 6, 4]} scale={[12, 6, 1]} rotation-x={Math.PI / 2} />
        <Lightformer intensity={1} color="#7dd3fc" position={[-8, 2, 4]} rotation-y={Math.PI / 2} scale={[20, 2, 1]} />
        <Lightformer intensity={0.6} position={[8, 2, 4]} rotation-y={-Math.PI / 2} scale={[20, 2, 1]} />
      </Environment>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, 6]} receiveShadow>
        <planeGeometry args={[60, 60]} />
        <meshStandardMaterial color="#1a1f27" roughness={0.85} metalness={0.1} />
      </mesh>
      <Grid
        position={[0, 0.005, 6]}
        args={[60, 60]}
        cellSize={0.5}
        cellThickness={0.5}
        cellColor="#2a3340"
        sectionSize={1}
        sectionThickness={1}
        sectionColor="#334155"
        fadeDistance={35}
        infiniteGrid
      />
      <Wall />
      <FloorScale />
      <CarGroup distance={distance} statuses={statuses} />
      <Beams distance={distance} />
      <DistanceIndicator distance={distance} backendDistance={backendDistance} />
      <OrbitControls
        ref={controls as never}
        target={[0, 0.8, 3]}
        enableDamping
        maxPolarAngle={Math.PI / 2 - 0.02}
        minDistance={4}
        maxDistance={30}
        onStart={() => {
          camTarget.current = null;
        }}
      />
      <CameraRig target={camTarget} controls={controls} />
    </Canvas>
  );
});
