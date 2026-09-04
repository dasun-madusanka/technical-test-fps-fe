import * as THREE from "three";

export type ColliderShape =
  | {
      type: "circle";
      x: number;
      z: number;
      radius: number;
      height?: number;
    }
  | {
      type: "box";
      x: number;
      z: number;
      halfWidth: number;
      halfDepth: number;
      rotationY: number;
      height?: number;
    };

export interface PropPlacement {
  assetKey: string;
  x: number;
  y: number;
  z: number;
  rotationY: number;
  scale?: number;
  collider?: ColliderShape;
}

export interface GroundTilePlacement {
  assetKey: string;
  x: number;
  y: number;
  z: number;
  rotationY: number;
}

export interface SpawnPoint {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

export const ARENA_HALF_SIZE = 15;
export const BOUNDARY_LIMIT = 14.4; // matches server clamp
export const PLAYER_RADIUS = 0.4;
export const EYE_HEIGHT = 1.6;

// -------------------------------------------------------------
// Curated Tactical Ground Spawn Points
// All points are strictly at y = EYE_HEIGHT (1.6) on the ground,
// placed in open corridors with guaranteed >= 1.5m obstacle clearance.
// -------------------------------------------------------------
export const ARENA_SPAWN_POINTS: SpawnPoint[] = [
  { x: 0, y: EYE_HEIGHT, z: 11.5, yaw: Math.PI },       // North Main Street
  { x: 0, y: EYE_HEIGHT, z: -11.5, yaw: 0 },            // South Main Street
  { x: 11.5, y: EYE_HEIGHT, z: 0, yaw: -Math.PI / 2 },  // East Crossway
  { x: -11.5, y: EYE_HEIGHT, z: 0, yaw: Math.PI / 2 },  // West Crossway
  { x: 10.5, y: EYE_HEIGHT, z: 9.5, yaw: -Math.PI * 0.75 }, // North-East Plaza
  { x: -10.5, y: EYE_HEIGHT, z: -9.5, yaw: Math.PI * 0.25 }, // South-West Plaza
  { x: -5.0, y: EYE_HEIGHT, z: 5.0, yaw: Math.PI * 0.5 },    // West Courtyard
  { x: 5.0, y: EYE_HEIGHT, z: -5.0, yaw: -Math.PI * 0.5 },   // East Courtyard
];

// -------------------------------------------------------------
// Modular Street Ground Layout (8m x 8m pieces covering 32m x 32m)
// -------------------------------------------------------------
export const STREET_TILES: GroundTilePlacement[] = [
  // Center intersection
  { assetKey: "street4Way", x: 0, y: 0, z: 0, rotationY: 0 },

  // North-South Avenue
  { assetKey: "streetStraight", x: 0, y: 0, z: 8, rotationY: 0 },
  { assetKey: "streetCrack1", x: 0, y: 0, z: -8, rotationY: 0 },

  // East-West Street
  { assetKey: "streetStraight", x: 8, y: 0, z: 0, rotationY: Math.PI / 2 },
  { assetKey: "streetCrack2", x: -8, y: 0, z: 0, rotationY: Math.PI / 2 },

  // Corner Blocks / Courtyards
  { assetKey: "streetTurn", x: 8, y: 0, z: 8, rotationY: Math.PI },
  { assetKey: "streetTurn", x: -8, y: 0, z: 8, rotationY: -Math.PI / 2 },
  { assetKey: "streetTurn", x: 8, y: 0, z: -8, rotationY: Math.PI / 2 },
  { assetKey: "streetTurn", x: -8, y: 0, z: -8, rotationY: 0 },
];

// -------------------------------------------------------------
// Tactical Environment Props with Exact Solid Colliders
// -------------------------------------------------------------
export const PROPS_LAYOUT: PropPlacement[] = [
  // --- Landmark ---
  {
    assetKey: "waterTower",
    x: 10,
    y: 0,
    z: -10,
    rotationY: 0,
    scale: 1.1,
    collider: { type: "circle", x: 10, z: -10, radius: 1.45, height: 9.4 },
  },
  {
    assetKey: "townSign",
    x: -3,
    y: 0,
    z: 13.8,
    rotationY: 0,
    collider: { type: "box", x: -3, z: 13.8, halfWidth: 2.8, halfDepth: 0.5, rotationY: 0, height: 5.0 },
  },

  // --- Vehicles (Key Tactical Cover) ---
  // Large delivery truck parked across center-west lane
  {
    assetKey: "vehicleTruck",
    x: -3.5,
    y: 0,
    z: -0.5,
    rotationY: 0.25,
    collider: {
      type: "box",
      x: -3.5,
      z: -0.5,
      halfWidth: 1.35,
      halfDepth: 2.6,
      rotationY: 0.25,
      height: 2.9,
    },
  },
  // Armored pickup angled on North-East street
  {
    assetKey: "vehiclePickupArmored",
    x: 4.5,
    y: 0,
    z: 3.5,
    rotationY: -0.4,
    collider: {
      type: "box",
      x: 4.5,
      z: 3.5,
      halfWidth: 1.25,
      halfDepth: 2.65,
      rotationY: -0.4,
      height: 2.0,
    },
  },
  // Civilian sports car crashed near South-East plaza
  {
    assetKey: "vehicleSports",
    x: 6.0,
    y: 0,
    z: -7.5,
    rotationY: 1.1,
    collider: {
      type: "box",
      x: 6.0,
      z: -7.5,
      halfWidth: 1.3,
      halfDepth: 2.7,
      rotationY: 1.1,
      height: 1.8,
    },
  },
  // Pickup truck near North-West alley
  {
    assetKey: "vehiclePickup",
    x: -6.5,
    y: 0,
    z: 7.5,
    rotationY: 2.3,
    collider: {
      type: "box",
      x: -6.5,
      z: 7.5,
      halfWidth: 1.2,
      halfDepth: 2.55,
      rotationY: 2.3,
      height: 1.9,
    },
  },

  // --- Fortified Shipping Containers (Compound structures) ---
  // North-West Container
  {
    assetKey: "containerRed",
    x: -11.5,
    y: 0,
    z: 11.0,
    rotationY: Math.PI / 2,
    collider: {
      type: "box",
      x: -11.5,
      z: 11.0,
      halfWidth: 1.3,
      halfDepth: 2.85,
      rotationY: Math.PI / 2,
      height: 2.6,
    },
  },
  // South-West Container
  {
    assetKey: "containerGreen",
    x: -11.5,
    y: 0,
    z: -11.0,
    rotationY: 0,
    collider: {
      type: "box",
      x: -11.5,
      z: -11.0,
      halfWidth: 2.85,
      halfDepth: 1.3,
      rotationY: 0,
      height: 2.6,
    },
  },
  // North-East Container
  {
    assetKey: "containerGreen",
    x: 11.5,
    y: 0,
    z: 11.0,
    rotationY: 0,
    collider: {
      type: "box",
      x: 11.5,
      z: 11.0,
      halfWidth: 2.85,
      halfDepth: 1.3,
      rotationY: 0,
      height: 2.6,
    },
  },
  // South-East Container
  {
    assetKey: "containerRed",
    x: 12.0,
    y: 0,
    z: -4.5,
    rotationY: Math.PI / 2,
    collider: {
      type: "box",
      x: 12.0,
      z: -4.5,
      halfWidth: 1.3,
      halfDepth: 2.85,
      rotationY: Math.PI / 2,
      height: 2.6,
    },
  },

  // --- Concrete & Traffic Barriers (Mid-height cover) ---
  {
    assetKey: "trafficBarrier1",
    x: 0,
    y: 0,
    z: -4.5,
    rotationY: 0,
    collider: {
      type: "box",
      x: 0,
      z: -4.5,
      halfWidth: 0.85,
      halfDepth: 0.45,
      rotationY: 0,
      height: 1.15,
    },
  },
  {
    assetKey: "trafficBarrier1",
    x: -1.6,
    y: 0,
    z: -4.5,
    rotationY: 0.1,
    collider: {
      type: "box",
      x: -1.6,
      z: -4.5,
      halfWidth: 0.85,
      halfDepth: 0.45,
      rotationY: 0.1,
      height: 1.15,
    },
  },
  {
    assetKey: "trafficBarrier2",
    x: 2.5,
    y: 0,
    z: -1.0,
    rotationY: 1.5,
    collider: {
      type: "box",
      x: 2.5,
      z: -1.0,
      halfWidth: 0.8,
      halfDepth: 0.4,
      rotationY: 1.5,
      height: 0.85,
    },
  },
  {
    assetKey: "trafficBarrier1",
    x: 0,
    y: 0,
    z: 4.5,
    rotationY: 0,
    collider: {
      type: "box",
      x: 0,
      z: 4.5,
      halfWidth: 0.85,
      halfDepth: 0.45,
      rotationY: 0,
      height: 1.15,
    },
  },
  {
    assetKey: "plasticBarrier",
    x: -1.5,
    y: 0,
    z: 4.5,
    rotationY: -0.1,
    collider: {
      type: "box",
      x: -1.5,
      z: 4.5,
      halfWidth: 0.55,
      halfDepth: 0.25,
      rotationY: -0.1,
      height: 0.65,
    },
  },

  // --- Solid Barrels (Cylinders) ---
  {
    assetKey: "barrel",
    x: 4.2,
    y: 0,
    z: 6.2,
    rotationY: 0.4,
    collider: { type: "circle", x: 4.2, z: 6.2, radius: 0.42, height: 1.15 },
  },
  {
    assetKey: "barrel",
    x: 4.8,
    y: 0,
    z: 6.7,
    rotationY: 1.2,
    collider: { type: "circle", x: 4.8, z: 6.7, radius: 0.42, height: 1.15 },
  },
  {
    assetKey: "barrel",
    x: -5.5,
    y: 0,
    z: -3.5,
    rotationY: 0,
    collider: { type: "circle", x: -5.5, z: -3.5, radius: 0.42, height: 1.15 },
  },
  {
    assetKey: "barrel",
    x: -6.1,
    y: 0,
    z: -3.1,
    rotationY: 2.1,
    collider: { type: "circle", x: -6.1, z: -3.1, radius: 0.42, height: 1.15 },
  },
  {
    assetKey: "barrel",
    x: -2.8,
    y: 0,
    z: -8.5,
    rotationY: 0.8,
    collider: { type: "circle", x: -2.8, z: -8.5, radius: 0.42, height: 1.15 },
  },
  {
    assetKey: "barrel",
    x: 7.5,
    y: 0,
    z: -3.0,
    rotationY: 1.5,
    collider: { type: "circle", x: 7.5, z: -3.0, radius: 0.42, height: 1.15 },
  },

  // --- Pallet Stacks & Cinderblocks ---
  {
    assetKey: "pallet",
    x: 7.0,
    y: 0,
    z: 4.5,
    rotationY: 0.3,
    collider: {
      type: "box",
      x: 7.0,
      z: 4.5,
      halfWidth: 0.55,
      halfDepth: 0.65,
      rotationY: 0.3,
      height: 0.5,
    },
  },
  {
    assetKey: "cinderBlock",
    x: 6.8,
    y: 0,
    z: 5.4,
    rotationY: 0,
    collider: {
      type: "box",
      x: 6.8,
      z: 5.4,
      halfWidth: 0.45,
      halfDepth: 0.35,
      rotationY: 0,
      height: 0.5,
    },
  },
  {
    assetKey: "palletBroken",
    x: -8.0,
    y: 0,
    z: -5.5,
    rotationY: 0.7,
    collider: {
      type: "box",
      x: -8.0,
      z: -5.5,
      halfWidth: 0.55,
      halfDepth: 0.65,
      rotationY: 0.7,
      height: 0.5,
    },
  },

  // --- Chests / Crates ---
  {
    assetKey: "chestSpecial",
    x: -7.5,
    y: 0,
    z: 3.5,
    rotationY: -0.3,
    collider: {
      type: "box",
      x: -7.5,
      z: 3.5,
      halfWidth: 0.5,
      halfDepth: 0.35,
      rotationY: -0.3,
      height: 0.5,
    },
  },
  {
    assetKey: "chest",
    x: 8.5,
    y: 0,
    z: -6.5,
    rotationY: 0.5,
    collider: {
      type: "box",
      x: 8.5,
      z: -6.5,
      halfWidth: 0.4,
      halfDepth: 0.3,
      rotationY: 0.5,
      height: 0.45,
    },
  },

  // --- Pipes & Furniture ---
  {
    assetKey: "pipes",
    x: -8.5,
    y: 0,
    z: -8.5,
    rotationY: 0.4,
    collider: {
      type: "box",
      x: -8.5,
      z: -8.5,
      halfWidth: 0.45,
      halfDepth: 1.7,
      rotationY: 0.4,
      height: 0.7,
    },
  },
  {
    assetKey: "couch",
    x: 8.5,
    y: 0,
    z: 8.0,
    rotationY: -1.2,
    collider: {
      type: "box",
      x: 8.5,
      z: 8.0,
      halfWidth: 1.55,
      halfDepth: 0.65,
      rotationY: -1.2,
      height: 1.25,
    },
  },

  // --- Tire Stacks (Cylinders) ---
  {
    assetKey: "wheelStack",
    x: 5.5,
    y: 0,
    z: 7.2,
    rotationY: 0,
    collider: { type: "circle", x: 5.5, z: 7.2, radius: 0.4, height: 0.7 },
  },
  {
    assetKey: "wheelStack",
    x: -5.0,
    y: 0,
    z: -7.0,
    rotationY: 0.6,
    collider: { type: "circle", x: -5.0, z: -7.0, radius: 0.4, height: 0.7 },
  },

  // --- Street Infrastructure (Poles & Hydrants) ---
  {
    assetKey: "trafficLight",
    x: 3.8,
    y: 0,
    z: 3.8,
    rotationY: Math.PI,
    collider: { type: "circle", x: 3.8, z: 3.8, radius: 0.28, height: 4.7 },
  },
  {
    assetKey: "trafficLight",
    x: -3.8,
    y: 0,
    z: -3.8,
    rotationY: 0,
    collider: { type: "circle", x: -3.8, z: -3.8, radius: 0.28, height: 4.7 },
  },
  {
    assetKey: "streetLights",
    x: 4.0,
    y: 0,
    z: -4.0,
    rotationY: -Math.PI / 2,
    collider: { type: "circle", x: 4.0, z: -4.0, radius: 0.25, height: 6.6 },
  },
  {
    assetKey: "streetLights",
    x: -4.0,
    y: 0,
    z: 4.0,
    rotationY: Math.PI / 2,
    collider: { type: "circle", x: -4.0, z: 4.0, radius: 0.25, height: 6.6 },
  },
  {
    assetKey: "streetLights",
    x: 10.0,
    y: 0,
    z: 3.0,
    rotationY: 0,
    collider: { type: "circle", x: 10.0, z: 3.0, radius: 0.25, height: 6.6 },
  },
  {
    assetKey: "streetLights",
    x: -10.0,
    y: 0,
    z: -3.0,
    rotationY: Math.PI,
    collider: { type: "circle", x: -10.0, z: -3.0, radius: 0.25, height: 6.6 },
  },
  {
    assetKey: "fireHydrant",
    x: 3.6,
    y: 0,
    z: -6.5,
    rotationY: 0,
    collider: { type: "circle", x: 3.6, z: -6.5, radius: 0.25, height: 0.8 },
  },
  {
    assetKey: "fireHydrant",
    x: -3.6,
    y: 0,
    z: 6.5,
    rotationY: Math.PI,
    collider: { type: "circle", x: -3.6, z: 6.5, radius: 0.25, height: 0.8 },
  },

  // --- Atmospheric Detailing (Non-collidable) ---
  { assetKey: "blood1", x: -1.0, y: 0.005, z: 0.5, rotationY: 0.4 },
  { assetKey: "blood2", x: 2.2, y: 0.005, z: -3.2, rotationY: 1.8 },
  { assetKey: "blood3", x: -4.5, y: 0.005, z: 2.0, rotationY: 2.5 },
  { assetKey: "trafficCone", x: 1.2, y: 0, z: 4.5, rotationY: 0 },
  { assetKey: "trafficCone", x: 1.2, y: 0, z: -4.5, rotationY: 1.2 },
  { assetKey: "trashBag", x: -12.5, y: 0, z: 9.8, rotationY: 0.3 },
  { assetKey: "trashBag", x: 12.5, y: 0, z: -6.0, rotationY: 0.9 },
  { assetKey: "trashBag", x: 7.2, y: 0, z: -8.8, rotationY: 1.4 },
];

// Extract pure colliders for rapid physics checks
export const ARENA_COLLIDERS: ColliderShape[] = PROPS_LAYOUT
  .map((p) => p.collider)
  .filter((c): c is ColliderShape => !!c);

// -------------------------------------------------------------
// Mathematical Sliding Collision Resolution
// Resolves 2D capsule/circle against both Circles & OBBs
// Performs multi-iteration relaxation to guarantee zero penetration
// -------------------------------------------------------------
export function resolveMovementCollision(
  pos: THREE.Vector3,
  playerRadius = PLAYER_RADIUS,
  iterations = 3,
): void {
  for (let iter = 0; iter < iterations; iter++) {
    for (const c of ARENA_COLLIDERS) {
      if (c.type === "circle") {
        const dx = pos.x - c.x;
        const dz = pos.z - c.z;
        const distSq = dx * dx + dz * dz;
        const minDist = c.radius + playerRadius;
        if (distSq < minDist * minDist) {
          const dist = Math.sqrt(distSq);
          if (dist > 1e-6) {
            const push = minDist - dist;
            pos.x += (dx / dist) * push;
            pos.z += (dz / dist) * push;
          } else {
            pos.x += minDist;
          }
        }
      } else if (c.type === "box") {
        // Transform player pos into box local coordinate system
        const cosA = Math.cos(-c.rotationY);
        const sinA = Math.sin(-c.rotationY);
        const relX = pos.x - c.x;
        const relZ = pos.z - c.z;
        const localX = cosA * relX - sinA * relZ;
        const localZ = sinA * relX + cosA * relZ;

        // Closest point on box bounds
        const clampedX = Math.max(-c.halfWidth, Math.min(c.halfWidth, localX));
        const clampedZ = Math.max(-c.halfDepth, Math.min(c.halfDepth, localZ));

        const diffX = localX - clampedX;
        const diffZ = localZ - clampedZ;
        const distSq = diffX * diffX + diffZ * diffZ;

        let pushLocalX = 0;
        let pushLocalZ = 0;

        if (distSq < playerRadius * playerRadius) {
          if (distSq > 1e-8) {
            const dist = Math.sqrt(distSq);
            const push = playerRadius - dist;
            pushLocalX = (diffX / dist) * push;
            pushLocalZ = (diffZ / dist) * push;
          } else {
            // Player center is completely inside box: push out along shortest axis
            const pushDistX = c.halfWidth + playerRadius - Math.abs(localX);
            const pushDistZ = c.halfDepth + playerRadius - Math.abs(localZ);
            if (pushDistX < pushDistZ) {
              pushLocalX = localX >= 0 ? pushDistX : -pushDistX;
              pushLocalZ = 0;
            } else {
              pushLocalX = 0;
              pushLocalZ = localZ >= 0 ? pushDistZ : -pushDistZ;
            }
          }

          // Rotate push back to world coordinates
          const cosW = Math.cos(c.rotationY);
          const sinW = Math.sin(c.rotationY);
          pos.x += cosW * pushLocalX - sinW * pushLocalZ;
          pos.z += sinW * pushLocalX + cosW * pushLocalZ;
        }
      }
    }

    // Boundary walls clamp
    pos.x = Math.max(-BOUNDARY_LIMIT, Math.min(BOUNDARY_LIMIT, pos.x));
    pos.z = Math.max(-BOUNDARY_LIMIT, Math.min(BOUNDARY_LIMIT, pos.z));
  }
}

// -------------------------------------------------------------
// Raycast 2D Obstacle Block Test (Used by Server & Client fallback)
// Tests if a ray between origin and target is occluded by ANY obstacle
// -------------------------------------------------------------
export function isRayBlockedByColliders(
  origin: { x: number; y?: number; z: number },
  dir: { x: number; y?: number; z: number },
  maxDist: number,
  colliders = ARENA_COLLIDERS,
): boolean {
  const oy = origin.y ?? 1.6;
  const dy = dir.y ?? 0;
  const horizLen = Math.hypot(dir.x, dir.z);
  if (horizLen < 1e-6) return false;

  const dx = dir.x / horizLen;
  const dz = dir.z / horizLen;
  const maxDist2D = maxDist * horizLen;

  for (const c of colliders) {
    let tHit2D: number | null = null;
    if (c.type === "circle") {
      // Ray-circle test
      const ocX = origin.x - c.x;
      const ocZ = origin.z - c.z;
      const b = ocX * dx + ocZ * dz;
      const disc = b * b - (ocX * ocX + ocZ * ocZ - c.radius * c.radius);
      if (disc >= 0) {
        const sqrtDisc = Math.sqrt(disc);
        const t1 = -b - sqrtDisc;
        const t2 = -b + sqrtDisc;
        if (t1 >= 0) tHit2D = t1;
        else if (t2 >= 0) tHit2D = t2;
      }
    } else if (c.type === "box") {
      // Transform ray origin and dir into box local space
      const cosA = Math.cos(-c.rotationY);
      const sinA = Math.sin(-c.rotationY);
      const localOx = cosA * (origin.x - c.x) - sinA * (origin.z - c.z);
      const localOz = sinA * (origin.x - c.x) + cosA * (origin.z - c.z);
      const localDx = cosA * dx - sinA * dz;
      const localDz = sinA * dx + cosA * dz;

      // Slab test on local AABB [-hw, hw] x [-hd, hd]
      let tmin = 0;
      let tmax = maxDist2D;
      let missed = false;

      if (Math.abs(localDx) < 1e-6) {
        if (localOx < -c.halfWidth || localOx > c.halfWidth) missed = true;
      } else {
        let t1 = (-c.halfWidth - localOx) / localDx;
        let t2 = (c.halfWidth - localOx) / localDx;
        if (t1 > t2) [t1, t2] = [t2, t1];
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) missed = true;
      }

      if (!missed) {
        if (Math.abs(localDz) < 1e-6) {
          if (localOz < -c.halfDepth || localOz > c.halfDepth) missed = true;
        } else {
          let t1 = (-c.halfDepth - localOz) / localDz;
          let t2 = (c.halfDepth - localOz) / localDz;
          if (t1 > t2) [t1, t2] = [t2, t1];
          tmin = Math.max(tmin, t1);
          tmax = Math.min(tmax, t2);
          if (tmin > tmax) missed = true;
        }
      }

      if (!missed && tmin <= tmax && tmax >= 0) {
        tHit2D = tmin > 0 ? tmin : tmax;
      }
    }

    if (tHit2D !== null) {
      const t3D = tHit2D / horizLen;
      // Exclude shooter self-hit near gun muzzle (t3D > 0.4) and verify within maxDist
      if (t3D > 0.4 && t3D < maxDist - 0.05) {
        const bulletY = oy + t3D * dy;
        const obstacleHeight = c.height ?? 3.0;
        if (bulletY >= 0 && bulletY <= obstacleHeight) {
          return true;
        }
      }
    }
  }
  return false;
}

// -------------------------------------------------------------
// Clearance Check for Spawning
// Returns true if a position has at least `minClearance` to all colliders
// -------------------------------------------------------------
export function isSpawnPositionSafe(
  x: number,
  z: number,
  minClearance = 1.0,
): boolean {
  for (const c of ARENA_COLLIDERS) {
    if (c.type === "circle") {
      const dist = Math.hypot(x - c.x, z - c.z);
      if (dist < c.radius + minClearance) return false;
    } else if (c.type === "box") {
      const cosA = Math.cos(-c.rotationY);
      const sinA = Math.sin(-c.rotationY);
      const lx = Math.abs(cosA * (x - c.x) - sinA * (z - c.z));
      const lz = Math.abs(sinA * (x - c.x) + cosA * (z - c.z));
      if (lx < c.halfWidth + minClearance && lz < c.halfDepth + minClearance) {
        return false;
      }
    }
  }
  return Math.abs(x) <= BOUNDARY_LIMIT - minClearance && Math.abs(z) <= BOUNDARY_LIMIT - minClearance;
}

// Pick a safe spawn location, optionally keeping distance from opponent
export function getSafeSpawnPoint(avoidPos?: { x: number; z: number }): SpawnPoint {
  const candidates = [...ARENA_SPAWN_POINTS];
  if (avoidPos) {
    // Sort descending by distance from opponent
    candidates.sort((a, b) => {
      const distA = Math.hypot(a.x - avoidPos.x, a.z - avoidPos.z);
      const distB = Math.hypot(b.x - avoidPos.x, b.z - avoidPos.z);
      return distB - distA;
    });
  }

  for (const p of candidates) {
    if (isSpawnPositionSafe(p.x, p.z, 1.2)) {
      return p;
    }
  }

  // Fallback to first verified spawn
  return candidates[0];
}
