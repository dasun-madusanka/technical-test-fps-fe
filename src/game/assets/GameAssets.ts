import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";

export interface LoadedCharacter {
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
}

export interface CharacterInstance {
  model: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  actions: Record<string, THREE.AnimationAction>;
  currentAction: string | null;
}

class GameAssetsLoader {
  private loader = new GLTFLoader();
  private cache = new Map<string, Promise<any>>();

  private loadGltf(url: string) {
    if (!this.cache.has(url)) {
      const promise = this.loader.loadAsync(url).then((gltf) => {
        gltf.scene.traverse((obj) => {
          const mesh = obj as THREE.Mesh;
          if ((mesh as THREE.Mesh).isMesh) {
            mesh.castShadow = true;
            mesh.receiveShadow = true;
          }
        });
        return gltf;
      });
      this.cache.set(url, promise);
    }
    return this.cache.get(url)!;
  }

  async loadCharacter(url: string): Promise<LoadedCharacter> {
    const gltf = await this.loadGltf(url);
    return { scene: gltf.scene, animations: gltf.animations };
  }

  async loadProp(url: string): Promise<THREE.Group> {
    const gltf = await this.loadGltf(url);
    return gltf.scene;
  }

  spawnCharacter(base: LoadedCharacter): CharacterInstance {
    const model = SkeletonUtils.clone(base.scene) as THREE.Object3D;
    model.traverse((obj) => {
      obj.userData.isCharacterPart = true;
    });
    const mixer = new THREE.AnimationMixer(model);
    const actions: Record<string, THREE.AnimationAction> = {};
    for (const clip of base.animations) {
      actions[clip.name] = mixer.clipAction(clip);
    }
    return { model, mixer, actions, currentAction: null };
  }

  spawnProp(base: THREE.Group): THREE.Object3D {
    return SkeletonUtils.clone(base) as THREE.Object3D;
  }

  /** Plays the dedicated death animation cleanly, stopping all other tracks and clamping the pose on the ground. */
  playDeath(instance: CharacterInstance) {
    instance.mixer.stopAllAction();
    const dieAction = instance.actions["die"];
    if (dieAction) {
      dieAction.reset();
      dieAction.setLoop(THREE.LoopOnce, 1);
      dieAction.clampWhenFinished = true;
      dieAction.play();
      instance.currentAction = "die";
    }
  }

  /** Cleans up death pose and transitions cleanly back to standing/holding action on respawn. */
  resetCharacterAfterDeath(instance: CharacterInstance, defaultAction = "holding-right") {
    instance.mixer.stopAllAction();
    const action = instance.actions[defaultAction];
    if (action) {
      action.reset();
      action.setLoop(THREE.LoopRepeat, Infinity);
      action.clampWhenFinished = false;
      action.play();
      instance.currentAction = defaultAction;
    }
  }

  /** Cross-fades to a new animation by name. No-op if already playing it or clip missing. */
  playAction(instance: CharacterInstance, name: string, fadeTime = 0.2, loopOnce = false) {
    // If currently playing death animation, do NOT allow regular animations to interrupt it
    if (instance.currentAction === "die" && name !== "die") return;
    if (name === "die") {
      this.playDeath(instance);
      return;
    }
    if (instance.currentAction === name) return;
    const next = instance.actions[name];
    if (!next) return;
    const prev = instance.currentAction ? instance.actions[instance.currentAction] : null;

    next.reset();
    next.setLoop(loopOnce ? THREE.LoopOnce : THREE.LoopRepeat, loopOnce ? 1 : Infinity);
    next.clampWhenFinished = loopOnce;
    next.fadeIn(fadeTime).play();
    prev?.fadeOut(fadeTime);
    instance.currentAction = name;
  }
}

export const gameAssets = new GameAssetsLoader();

export const ASSET_PATHS = {
  zombie: "/models/CharactersBlocky/character-d.glb",
  characterMatt: "/models/CharactersBlocky/character-a.glb",
  characterLis: "/models/CharactersBlocky/character-b.glb",
  characterSam: "/models/CharactersBlocky/character-c.glb",
  characterShaun: "/models/CharactersBlocky/character-d.glb",
  rifleWeapon: "/models/WeaponsBlocky/blasterA.glb",
  pistolWeapon: "/models/WeaponsBlocky/blasterF.glb",
  knifeWeapon: "/models/WeaponsBlocky/blasterC.glb",

  // Environment Structures & Props
  containerRed: "/models/Environment/glTF/Container_Red.gltf",
  containerGreen: "/models/Environment/glTF/Container_Green.gltf",
  waterTower: "/models/Environment/glTF/WaterTower.gltf",
  townSign: "/models/Environment/glTF/TownSign.gltf",
  barrel: "/models/Environment/glTF/Barrel.gltf",
  trafficBarrier1: "/models/Environment/glTF/TrafficBarrier_1.gltf",
  trafficBarrier2: "/models/Environment/glTF/TrafficBarrier_2.gltf",
  trafficBarrier: "/models/Environment/glTF/TrafficBarrier_1.gltf",
  plasticBarrier: "/models/Environment/glTF/PlasticBarrier.gltf",
  trafficCone: "/models/Environment/glTF/TrafficCone_1.gltf",
  cinderBlock: "/models/Environment/glTF/CinderBlock.gltf",
  pallet: "/models/Environment/glTF/Pallet.gltf",
  palletBroken: "/models/Environment/glTF/Pallet_Broken.gltf",
  chest: "/models/Environment/glTF/Chest.gltf",
  chestSpecial: "/models/Environment/glTF/Chest_Special.gltf",
  couch: "/models/Environment/glTF/Couch.gltf",
  pipes: "/models/Environment/glTF/Pipes.gltf",
  trashBag: "/models/Environment/glTF/TrashBag_1.gltf",
  streetLights: "/models/Environment/glTF/StreetLights.gltf",
  trafficLight: "/models/Environment/glTF/TrafficLight_1.gltf",
  fireHydrant: "/models/Environment/glTF/FireHydrant.gltf",
  wheelStack: "/models/Environment/glTF/Wheels_Stack.gltf",
  blood1: "/models/Environment/glTF/Blood_1.gltf",
  blood2: "/models/Environment/glTF/Blood_2.gltf",
  blood3: "/models/Environment/glTF/Blood_3.gltf",

  // Modular Streets
  street4Way: "/models/Environment/glTF/Street_4Way.gltf",
  streetStraight: "/models/Environment/glTF/Street_Straight.gltf",
  streetTurn: "/models/Environment/glTF/Street_Turn.gltf",
  streetT: "/models/Environment/glTF/Street_T.gltf",
  streetCrack1: "/models/Environment/glTF/Street_Straight_Crack1.gltf",
  streetCrack2: "/models/Environment/glTF/Street_Straight_Crack2.gltf",

  // Vehicles
  vehicleTruck: "/models/Vehicles/glTF/Vehicle_Truck.gltf",
  vehiclePickup: "/models/Vehicles/glTF/Vehicle_Pickup.gltf",
  vehiclePickupArmored: "/models/Vehicles/glTF/Vehicle_Pickup_Armored.gltf",
  vehicleSports: "/models/Vehicles/glTF/Vehicle_Sports.gltf",
} as const;

export const CHARACTER_ASSET_PATHS = [
  ASSET_PATHS.characterMatt,
  ASSET_PATHS.characterLis,
  ASSET_PATHS.characterSam,
  ASSET_PATHS.characterShaun,
];

export const WEAPON_ASSET_BY_KEY: Record<string, string> = {
  rifle: ASSET_PATHS.rifleWeapon,
  pistol: ASSET_PATHS.pistolWeapon,
  knife: ASSET_PATHS.knifeWeapon,
};

// The Kenney Blocky Characters rig has no dedicated hand socket empties -
// every weapon parents to the "arm-right" node instead, then gets nudged
// into the hand with WEAPON_GRIP_OFFSET below.
const WEAPON_SOCKET_NAME: Record<string, string> = {
  rifle: "arm-right",
  pistol: "arm-right",
  knife: "arm-right",
};

// Starting-point offsets to seat each weapon in the hand. arm-right's local
// origin is at the shoulder and the arm mesh hangs from y=0.1 (shoulder) to
// y=-1.0 (hand), so the hand is roughly (0, -0.95, 0.1) in the arm's local
// space. These are a starting guess - tune per weapon by eye in-browser.
const WEAPON_GRIP_OFFSET: Record<string, { position: [number, number, number]; rotation: [number, number, number] }> = {
  rifle: { position: [0, -0.95, 0.15], rotation: [0, 0, 0] },
  pistol: { position: [0, -0.95, 0.1], rotation: [0, 0, 0] },
  knife: { position: [0, -0.95, 0.1], rotation: [0, 0, 0] },
};

export function pickCharacterPath(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return CHARACTER_ASSET_PATHS[hash % CHARACTER_ASSET_PATHS.length];
}

/** Removes any previously attached weapon and parents the new one to the correct hand socket. */
export function attachWeaponToCharacter(
  character: CharacterInstance,
  weaponModel: THREE.Object3D,
  weaponKey: string,
) {
  const previous = character.model.userData.attachedWeapon as THREE.Object3D | undefined;
  if (previous) previous.parent?.remove(previous);

  const socketName = WEAPON_SOCKET_NAME[weaponKey];
  const socket = socketName ? character.model.getObjectByName(socketName) : null;
  const parent = socket ?? character.model;

  parent.add(weaponModel);
  const offset = WEAPON_GRIP_OFFSET[weaponKey] ?? { position: [0, 0, 0] as [number, number, number], rotation: [0, 0, 0] as [number, number, number] };
  weaponModel.position.set(...offset.position);
  weaponModel.rotation.set(...offset.rotation);
  character.model.userData.attachedWeapon = weaponModel;
}

export function createMuzzleFlashSprite(): THREE.Sprite {
  const material = new THREE.SpriteMaterial({
    color: 0xffcc66,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(0.18, 0.18, 0.18);
  return sprite;
}

export function spawnTracer(scene: THREE.Scene, from: THREE.Vector3, to: THREE.Vector3) {
  const direction = to.clone().sub(from);
  const length = direction.length();
  if (length < 0.01) return null;
  const geometry = new THREE.CylinderGeometry(0.006, 0.006, length, 5, 1);
  const material = new THREE.MeshBasicMaterial({
    color: 0xfff3b0,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
  });
  const tracer = new THREE.Mesh(geometry, material);
  tracer.position.copy(from.clone().add(to).multiplyScalar(0.5));
  tracer.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
  scene.add(tracer);
  return { mesh: tracer, life: 0.08 };
}

export interface BulletImpact {
  group: THREE.Group;
  life: number;
  maxLife: number;
}

export function spawnBulletImpact(
  scene: THREE.Scene,
  point: THREE.Vector3,
  normal?: THREE.Vector3,
): BulletImpact {
  const group = new THREE.Group();
  group.position.copy(point);

  const sparkCount = 10;
  const positions = new Float32Array(sparkCount * 3);
  const velocities: THREE.Vector3[] = [];
  const baseNorm = normal ? normal.clone().normalize() : new THREE.Vector3(0, 1, 0);

  for (let i = 0; i < sparkCount; i++) {
    positions[i * 3] = 0;
    positions[i * 3 + 1] = 0;
    positions[i * 3 + 2] = 0;
    const spread = new THREE.Vector3(
      (Math.random() - 0.5) * 1.5,
      (Math.random() - 0.5) * 1.5,
      (Math.random() - 0.5) * 1.5,
    );
    velocities.push(baseNorm.clone().multiplyScalar(2.0 + Math.random() * 2.5).add(spread));
  }

  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const sparkMat = new THREE.PointsMaterial({
    color: 0xffe090,
    size: 0.04,
    transparent: true,
    opacity: 1,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const sparkPoints = new THREE.Points(sparkGeo, sparkMat);
  group.add(sparkPoints);

  const flashMat = new THREE.SpriteMaterial({
    color: 0xffaa44,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const flashSprite = new THREE.Sprite(flashMat);
  flashSprite.scale.set(0.3, 0.3, 0.3);
  group.add(flashSprite);

  scene.add(group);
  group.userData = { velocities, sparkGeo, sparkMat, flashMat, flashSprite };

  return { group, life: 0.15, maxLife: 0.15 };
}

export function updateBulletImpact(impact: BulletImpact, delta: number, scene: THREE.Scene): boolean {
  impact.life -= delta;
  if (impact.life <= 0) {
    const data = impact.group.userData;
    if (data) {
      data.sparkGeo?.dispose();
      data.sparkMat?.dispose();
      data.flashMat?.dispose();
    }
    scene.remove(impact.group);
    return false;
  }

  const alpha = impact.life / impact.maxLife;
  const data = impact.group.userData;
  if (data && data.velocities) {
    const attr = data.sparkGeo.getAttribute("position") as THREE.BufferAttribute;
    const array = attr.array as Float32Array;
    for (let i = 0; i < data.velocities.length; i++) {
      const v = data.velocities[i] as THREE.Vector3;
      v.y -= 9.8 * delta;
      array[i * 3] += v.x * delta;
      array[i * 3 + 1] += v.y * delta;
      array[i * 3 + 2] += v.z * delta;
    }
    attr.needsUpdate = true;
    data.sparkMat.opacity = alpha;
    data.flashMat.opacity = alpha * alpha;
    data.flashSprite.scale.setScalar(0.3 * alpha);
  }
  return true;
}