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

  /** Cross-fades to a new animation by name. No-op if already playing it or clip missing. */
  playAction(instance: CharacterInstance, name: string, fadeTime = 0.2, loopOnce = false) {
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
  zombie: "/models/Characters/glTF/Zombie_Basic.gltf",
  characterMatt: "/models/Characters/glTF/Characters_Matt.gltf",
  characterLis: "/models/Characters/glTF/Characters_Lis.gltf",
  characterSam: "/models/Characters/glTF/Characters_Sam.gltf",
  characterShaun: "/models/Characters/glTF/Characters_Shaun.gltf",
  rifleWeapon: "/models/Weapons/glTF/Rifle.gltf",
  pistolWeapon: "/models/Weapons/glTF/Pistol.gltf",
  knifeWeapon: "/models/Weapons/glTF/Knife.gltf",
  containerRed: "/models/Environment/glTF/Container_Red.gltf",
  containerGreen: "/models/Environment/glTF/Container_Green.gltf",
  barrel: "/models/Environment/glTF/Barrel.gltf",
  trafficCone: "/models/Environment/glTF/TrafficCone_1.gltf",
  trafficBarrier: "/models/Environment/glTF/TrafficBarrier_1.gltf",
  cinderBlock: "/models/Environment/glTF/CinderBlock.gltf",
  pallet: "/models/Environment/glTF/Pallet.gltf",
  chest: "/models/Environment/glTF/Chest.gltf",
  trashBag: "/models/Environment/glTF/TrashBag_1.gltf",
  streetLights: "/models/Environment/glTF/StreetLights.gltf",
  waterTower: "/models/Environment/glTF/WaterTower.gltf",
  
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

// matches the empty socket node names baked into each character's skeleton
const WEAPON_SOCKET_NAME: Record<string, string> = {
  rifle: "Rifle",
  pistol: "Pistol",
  knife: "Knife",
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
  weaponModel.position.set(0, 0, 0);
  weaponModel.rotation.set(0, 0, 0);
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