import * as THREE from "three";
import {
  gameAssets,
  ASSET_PATHS,
  CharacterInstance,
  LoadedCharacter,
  pickCharacterPath,
  WEAPON_ASSET_BY_KEY,
  attachWeaponToCharacter,
  createMuzzleFlashSprite,
  spawnBulletImpact,
  updateBulletImpact,
  BulletImpact,
} from "./assets/GameAssets";
import {
  PROPS_LAYOUT,
  STREET_TILES,
  resolveMovementCollision,
  getSafeSpawnPoint,
  isSpawnPositionSafe,
  BOUNDARY_LIMIT,
  PLAYER_RADIUS,
} from "./arena/ArenaLayout";
import { soundManager, weaponSound } from "./audio/SoundManager";

export interface ArenaState {
  playerHealth: number;
  playerAmmo: number;
  magazineSize: number;
  isReloading: boolean;
  playerKills: number;
  playerDeaths: number;
  botKills: number;
  isPlayerDead: boolean;
  respawnCountdown: number;
  killFeed: string[];
  matchOver: boolean;
  playerWon: boolean;
  currentWeaponName: string;
  currentWeaponSlot: number;
}

type StateListener = (state: ArenaState) => void;

export interface WeaponConfig {
  key: string;
  name: string;
  damage: number;
  fireRate: number; // rounds per minute
  magazineSize: number;
}

export interface WeaponInventory {
  primary: WeaponConfig;
  secondary: WeaponConfig;
  melee: WeaponConfig;
}

export interface GameSettings {
  mouseSens: number;
  keyForward: string;
  keyBackward: string;
  keyLeft: string;
  keyRight: string;
  keyJump: string;
  keyReload: string;
}

const DEFAULT_WEAPON: WeaponConfig = {
  key: "rifle",
  name: "Assault Rifle",
  damage: 20,
  fireRate: 750,
  magazineSize: 30,
};

const DEFAULT_SECONDARY: WeaponConfig = {
  key: "pistol",
  name: "Combat Pistol",
  damage: 25,
  fireRate: 400,
  magazineSize: 12,
};

const DEFAULT_MELEE: WeaponConfig = {
  key: "knife",
  name: "Combat Knife",
  damage: 75,
  fireRate: 150,
  magazineSize: 1,
};

const DEFAULT_INVENTORY: WeaponInventory = {
  primary: DEFAULT_WEAPON,
  secondary: DEFAULT_SECONDARY,
  melee: DEFAULT_MELEE,
};

export const DEFAULT_SETTINGS: GameSettings = {
  mouseSens: 0.7,
  keyForward: "KeyW",
  keyBackward: "KeyS",
  keyLeft: "KeyA",
  keyRight: "KeyD",
  keyJump: "Space",
  keyReload: "KeyR",
};

// weapon slot -> asset path, so slot order stays [primary(rifle), secondary(pistol), melee(knife)]
const WEAPON_ASSET_BY_SLOT = [
  ASSET_PATHS.rifleWeapon,
  ASSET_PATHS.pistolWeapon,
  ASSET_PATHS.knifeWeapon,
];

const ARENA_HALF_SIZE = 15;
const PLAYER_SPEED = 5.5;
const PLAYER_HEIGHT = 1.6;
const RELOAD_TIME_MS = 1500;
const BOT_DAMAGE = 12;
const BOT_FIRE_INTERVAL_MS = 900;
const BOT_HEALTH_MAX = 100;
const PLAYER_HEALTH_MAX = 100;
const RESPAWN_SECONDS = 3;
const SCORE_LIMIT = 10;
const GRAVITY = -18;
const JUMP_SPEED = 6.5;
const GROUND_Y = PLAYER_HEIGHT;
const BOT_SPEED = 2.2;
const BOT_SCALE = 0.65;

export class ArenaGame {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private raycaster = new THREE.Raycaster();
  private clock = new THREE.Clock();
  private animationId = 0;
  private canvas: HTMLCanvasElement;
  private running = false;
  private ready: Promise<void>;

  // player
  private yaw = 0;
  private pitch = 0;
  private velocity = new THREE.Vector3();
  private verticalVelocity = 0;
  private isGrounded = true;
  private keys: Record<string, boolean> = {};
  private lastShotTime = 0;
  private reloading = false;
  private settings: GameSettings;

  // weapons
  private inventory: WeaponConfig[]; // [primary, secondary, melee]
  private ammoPerWeapon: number[];
  private currentSlot = 0;
  private lastSlot = 0;
  private weaponKills = [0, 0, 0];

  // weapon view-models (3D)
  private weaponRig = new THREE.Group(); // attached to camera
  private weaponModels: THREE.Object3D[] = []; // one per slot, only current is visible
  private weaponRestPosition = new THREE.Vector3(0.28, -0.24, -0.55);
  private weaponRestRotation = new THREE.Euler(0, Math.PI, 0);
  private recoilOffset = new THREE.Vector3();
  private recoilRotation = 0;
  private muzzleFlash: THREE.Sprite;
  private muzzleFlashTimer = 0;
  private tracers: { mesh: THREE.Mesh; life: number }[] = [];
  private bulletImpacts: BulletImpact[] = [];
  private boundaryWalls: THREE.Mesh[] = [];

  private get weapon(): WeaponConfig {
    return this.inventory[this.currentSlot];
  }

  // bot (zombie)
  private bot: CharacterInstance | null = null;
  private botHealth = BOT_HEALTH_MAX;
  private botLastShotTime = 0;
  private botTarget = new THREE.Vector3();
  private botAlive = true;
  private botDying = false;
  private botRetargetTimer = 0;

  private obstacles: THREE.Object3D[] = [];

  private state: ArenaState;
  private onState: StateListener;
  private hitFlashEl: HTMLDivElement | null = null;
  private pointerLockCooldownUntil = 0;

  constructor(
    canvas: HTMLCanvasElement,
    onState: StateListener,
    inventory: WeaponInventory = DEFAULT_INVENTORY,
    settings: GameSettings = DEFAULT_SETTINGS,
  ) {
    this.canvas = canvas;
    this.onState = onState;
    this.inventory = [inventory.primary, inventory.secondary, inventory.melee];
    this.ammoPerWeapon = this.inventory.map((w) => w.magazineSize);
    this.settings = settings;

    this.state = {
      playerHealth: PLAYER_HEALTH_MAX,
      playerAmmo: this.ammoPerWeapon[0],
      magazineSize: this.inventory[0].magazineSize,
      isReloading: false,
      playerKills: 0,
      playerDeaths: 0,
      botKills: 0,
      isPlayerDead: false,
      respawnCountdown: 0,
      killFeed: [],
      matchOver: false,
      playerWon: false,
      currentWeaponName: this.inventory[0].name,
      currentWeaponSlot: 0,
    };

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    console.log("canvas size at init:", canvas.clientWidth, canvas.clientHeight);
    console.log("WebGL context:", this.renderer.getContext());
    this.canvas.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      console.error("🔴 WebGL context lost!", e);
    });
    this.canvas.addEventListener("webglcontextrestored", () => {
      console.warn("🟢 WebGL context restored");
    });
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x8fd0f0); // bright day sky
    this.scene.fog = new THREE.Fog(0x9fdcff, 35, 90);

    this.camera = new THREE.PerspectiveCamera(
      78,
      canvas.clientWidth / canvas.clientHeight,
      0.1,
      1000,
    );
    this.camera.add(this.weaponRig);
    this.scene.add(this.camera);
    this.resetPlayerPosition();

    soundManager.attachListener(this.camera);

    this.muzzleFlash = this.createMuzzleFlash();
    this.weaponRig.add(this.muzzleFlash);

    this.buildStaticArena();
    this.setupLights();

    window.addEventListener("resize", this.handleResize);
    canvas.addEventListener("mousedown", this.handleMouseDown);
    document.addEventListener("mousemove", this.handleMouseMove);
    document.addEventListener("keydown", this.handleKeyDown);
    document.addEventListener("keyup", this.handleKeyUp);
    document.addEventListener(
      "pointerlockchange",
      this.handlePointerLockChange,
    );
    document.addEventListener("pointerlockerror", this.handlePointerLockError);

    this.emitState();

    this.ready = this.loadAssetsAndPopulate();
  }

  private triggerLocalHitFlash() {
    if (!this.hitFlashEl) {
      const el = document.createElement("div");
      el.style.cssText =
        "position:fixed;inset:0;pointer-events:none;z-index:25;opacity:0;transition:opacity 60ms;" +
        "background:radial-gradient(circle, transparent 40%, rgba(255,0,0,0.35) 100%);";
      this.canvas.parentElement?.appendChild(el);
      this.hitFlashEl = el;
    }
    this.hitFlashEl.style.opacity = "1";
    setTimeout(() => {
      if (this.hitFlashEl) this.hitFlashEl.style.opacity = "0";
    }, 100);
  }

  // ---------- async asset loading ----------

  private async loadAssetsAndPopulate() {
    const botCharacterPath = pickCharacterPath("bot-" + Math.random());
    const soundsPromise = soundManager.preloadAll();
    const [botBase, rifleBase, ...weaponBases] = await Promise.all([
      gameAssets.loadCharacter(botCharacterPath),
      gameAssets.loadProp(WEAPON_ASSET_BY_KEY.rifle),
      ...WEAPON_ASSET_BY_SLOT.map((path) => gameAssets.loadProp(path)),
    ]);

    await soundsPromise;

    // weapon view-models, one per slot, attached to camera rig
    this.weaponModels = weaponBases.map((base, i) => {
      const model = gameAssets.spawnProp(base);
      model.scale.setScalar(0.9);
      model.position.copy(this.weaponRestPosition);
      model.rotation.copy(this.weaponRestRotation);
      model.visible = i === this.currentSlot;
      model.traverse((o) => {
        (o as THREE.Mesh).castShadow = false;
        (o as THREE.Mesh).receiveShadow = false;
      });
      this.weaponRig.add(model);
      return model;
    });

    try {
      await this.loadEnvironmentProps();
    } catch (err) {
      console.error(
        "Environment props failed to load — check public/environment/ file names:",
        err,
      );
    }
    this.spawnBot(botBase, rifleBase);
  }

  private zombieBaseCache: Awaited<
    ReturnType<typeof gameAssets.loadCharacter>
  > | null = null;
  private botCharacterCache: LoadedCharacter | null = null;

  private async loadEnvironmentProps() {
    const uniqueKeys = Array.from(
      new Set([
        ...STREET_TILES.map((t) => t.assetKey),
        ...PROPS_LAYOUT.map((p) => p.assetKey),
      ]),
    ) as (keyof typeof ASSET_PATHS)[];

    const loadedBases = await Promise.all(
      uniqueKeys.map(async (key) => {
        const path = ASSET_PATHS[key];
        const base = await gameAssets.loadProp(path);
        return [key, base] as const;
      }),
    );
    const baseMap = new Map<string, THREE.Group>(loadedBases);

    // Spawn modular street tiles on ground
    for (const tile of STREET_TILES) {
      const base = baseMap.get(tile.assetKey);
      if (!base) continue;
      const mesh = gameAssets.spawnProp(base);
      mesh.position.set(tile.x, tile.y, tile.z);
      mesh.rotation.y = tile.rotationY;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
    }

    // Spawn tactical environment props
    for (const prop of PROPS_LAYOUT) {
      const base = baseMap.get(prop.assetKey);
      if (!base) continue;
      const model = gameAssets.spawnProp(base);
      model.position.set(prop.x, prop.y, prop.z);
      model.rotation.y = prop.rotationY;
      if (prop.scale) model.scale.setScalar(prop.scale);
      this.scene.add(model);

      if (prop.collider) {
        this.obstacles.push(model);
      }
    }
  }

  private createMuzzleFlash(): THREE.Sprite {
    const material = new THREE.SpriteMaterial({
      color: 0xffcc66,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(0.18, 0.18, 0.18);
    sprite.position.set(
      this.weaponRestPosition.x,
      this.weaponRestPosition.y + 0.02,
      this.weaponRestPosition.z - 0.55,
    );
    return sprite;
  }

  private resetPlayerPosition() {
    const spawn = getSafeSpawnPoint();
    this.camera.position.set(spawn.x, GROUND_Y, spawn.z);
    this.yaw = spawn.yaw;
    this.pitch = 0;
    this.verticalVelocity = 0;
    this.isGrounded = true;
    this.camera.quaternion.setFromEuler(new THREE.Euler(0, this.yaw, 0, "YXZ"));
  }

  private buildStaticArena() {
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(ARENA_HALF_SIZE * 2 + 10, ARENA_HALF_SIZE * 2 + 10),
      new THREE.MeshStandardMaterial({ color: 0x24282b, roughness: 0.95 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.01;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // Enclosing perimeter walls
    const WALL_HEIGHT = 4.5;
    const WALL_THICKNESS = 1.2;
    const wallMaterial = new THREE.MeshStandardMaterial({
      color: 0x30343a,
      roughness: 0.85,
      metalness: 0.2,
    });
    const span = ARENA_HALF_SIZE * 2 + WALL_THICKNESS;

    const northSouth = new THREE.BoxGeometry(span, WALL_HEIGHT, WALL_THICKNESS);
    const eastWest = new THREE.BoxGeometry(WALL_THICKNESS, WALL_HEIGHT, span);

    const north = new THREE.Mesh(northSouth, wallMaterial);
    north.position.set(0, WALL_HEIGHT / 2, -ARENA_HALF_SIZE - WALL_THICKNESS / 2);
    const south = new THREE.Mesh(northSouth, wallMaterial);
    south.position.set(0, WALL_HEIGHT / 2, ARENA_HALF_SIZE + WALL_THICKNESS / 2);
    const east = new THREE.Mesh(eastWest, wallMaterial);
    east.position.set(ARENA_HALF_SIZE + WALL_THICKNESS / 2, WALL_HEIGHT / 2, 0);
    const west = new THREE.Mesh(eastWest, wallMaterial);
    west.position.set(-ARENA_HALF_SIZE - WALL_THICKNESS / 2, WALL_HEIGHT / 2, 0);

    this.boundaryWalls = [north, south, east, west];
    for (const wall of this.boundaryWalls) {
      wall.castShadow = true;
      wall.receiveShadow = true;
      this.scene.add(wall);
      this.obstacles.push(wall);
    }
  }

  private setupLights() {
    this.scene.add(new THREE.HemisphereLight(0xbfe3ff, 0x4a6b3a, 1.1));

    const sun = new THREE.DirectionalLight(0xfff6e0, 1.9);
    sun.position.set(20, 30, 12);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -ARENA_HALF_SIZE - 5;
    sun.shadow.camera.right = ARENA_HALF_SIZE + 5;
    sun.shadow.camera.top = ARENA_HALF_SIZE + 5;
    sun.shadow.camera.bottom = -ARENA_HALF_SIZE - 5;
    sun.shadow.camera.far = 80;
    sun.shadow.bias = -0.0015;
    this.scene.add(sun);

    const fill = new THREE.AmbientLight(0xffffff, 0.35);
    this.scene.add(fill);
  }

  private spawnBot(base: LoadedCharacter, weaponBase: THREE.Group) {
    this.botCharacterCache = base;
    const instance = gameAssets.spawnCharacter(base);
    instance.model.scale.setScalar(BOT_SCALE);

    const botSpawn = getSafeSpawnPoint({ x: this.camera.position.x, z: this.camera.position.z });
    instance.model.position.set(botSpawn.x, 0, botSpawn.z);
    instance.model.rotation.y = botSpawn.yaw;

    instance.model.traverse((o) => {
      o.userData.isBotPart = true;
    });

    const weaponModel = gameAssets.spawnProp(weaponBase);
    attachWeaponToCharacter(instance, weaponModel, "rifle");

    const flash = createMuzzleFlashSprite();
    flash.position.set(0, 0.05, -0.6);
    weaponModel.add(flash);
    instance.model.userData.muzzleFlash = flash;

    this.scene.add(instance.model);
    gameAssets.playAction(instance, "holding-right", 0.1);

    this.bot = instance;
    this.botHealth = BOT_HEALTH_MAX;
    this.botAlive = true;
    this.botDying = false;
    this.botTarget.copy(instance.model.position);
  }

  private respawnBot() {
    if (!this.bot) return;
    this.scene.remove(this.bot.model);

    const characterPath = pickCharacterPath("bot-" + Math.random());
    Promise.all([
      gameAssets.loadCharacter(characterPath),
      gameAssets.loadProp(WEAPON_ASSET_BY_KEY.rifle),
    ]).then(([base, weaponBase]) => {
      this.spawnBot(base, weaponBase);
    });
  }

  // ---------- input ----------

  private handleKeyDown = (e: KeyboardEvent) => {
    this.keys[e.code] = true;
    if (e.code === this.settings.keyReload) this.reload();
    if (e.code === this.settings.keyJump) this.jump();
    if (e.code === "Digit1") this.switchToSlot(0);
    if (e.code === "Digit2") this.switchToSlot(1);
    if (e.code === "Digit3") this.switchToSlot(2);
    if (e.code === "KeyQ") this.quickSwitch();
  };
  private handleKeyUp = (e: KeyboardEvent) => {
    this.keys[e.code] = false;
  };

  private jump() {
    if (!this.isGrounded || this.state.isPlayerDead) return;
    this.verticalVelocity = JUMP_SPEED;
    this.isGrounded = false;
    soundManager.play2D("jump", 0.6);
  }

  private handleMouseMove = (e: MouseEvent) => {
    if (document.pointerLockElement !== this.canvas) return;
    const sensitivity = 0.0022 * (this.settings.mouseSens / 0.7);
    this.yaw -= e.movementX * sensitivity;
    this.pitch -= e.movementY * sensitivity;
    this.pitch = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, this.pitch));
    this.camera.quaternion.setFromEuler(
      new THREE.Euler(this.pitch, this.yaw, 0, "YXZ"),
    );
  };

  private handleMouseDown = () => {
    if (document.pointerLockElement !== this.canvas) {
      if (performance.now() < this.pointerLockCooldownUntil) return;
      const result = this.canvas.requestPointerLock() as unknown;
      if (result instanceof Promise) {
        result.catch(() => {
          // browser refused (e.g. cooldown after exiting lock) — back off briefly
          this.pointerLockCooldownUntil = performance.now() + 1200;
        });
      }
      return;
    }
    this.shoot();
  };

  private handlePointerLockChange = () => {
    if (document.pointerLockElement !== this.canvas) {
      // lock was just released — browsers block immediate re-acquisition
      this.pointerLockCooldownUntil = performance.now() + 1200;
    }
  };

  private handlePointerLockError = () => {
    this.pointerLockCooldownUntil = performance.now() + 1200;
  };

  private handleResize = () => {
    const { clientWidth, clientHeight } = this.canvas;
    this.camera.aspect = clientWidth / clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(clientWidth, clientHeight);
  };

  // ---------- weapon ----------

  private switchToSlot(slot: number) {
    if (
      slot === this.currentSlot ||
      this.state.isPlayerDead ||
      slot < 0 ||
      slot > 2
    )
      return;

    soundManager.play2D("weapon_switch", 0.5);
    this.lastSlot = this.currentSlot;
    this.currentSlot = slot;
    this.reloading = false;
    this.state.isReloading = false;
    this.state.playerAmmo = this.ammoPerWeapon[slot];
    this.state.magazineSize = this.inventory[slot].magazineSize;
    this.state.currentWeaponName = this.inventory[slot].name;
    this.state.currentWeaponSlot = slot;

    this.weaponModels.forEach((model, i) => {
      model.visible = i === slot;
    });

    this.emitState();
  }

  private quickSwitch() {
    this.switchToSlot(this.lastSlot);
  }

  private shoot() {
    if (this.state.isPlayerDead || this.reloading || this.state.matchOver)
      return;
    const now = performance.now();
    const fireIntervalMs = 60000 / this.weapon.fireRate;
    if (now - this.lastShotTime < fireIntervalMs) return;
    if (this.state.playerAmmo <= 0) {
      soundManager.play2D("dry_fire", 0.5);
      this.reload();
      return;
    }

    this.lastShotTime = now;
    this.state.playerAmmo -= 1;
    this.ammoPerWeapon[this.currentSlot] = this.state.playerAmmo;

    this.triggerRecoil();
    this.triggerMuzzleFlash();
    soundManager.play2D(weaponSound(this.weapon.key, "fire"));

    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    const targets: THREE.Object3D[] =
      this.botAlive && this.bot
        ? [this.bot.model, ...this.obstacles]
        : this.obstacles;
    const hits = this.raycaster.intersectObjects(targets, true);

    const firstHit = hits[0];
    if (firstHit) {
      this.spawnTracer(firstHit.point);
      const root = this.resolveHitRoot(firstHit.object, targets);
      if (this.bot && root === this.bot.model) {
        this.damageBot(this.weapon.damage);
        soundManager.play2D("hit_landed", 0.6);
      } else {
        const impact = spawnBulletImpact(
          this.scene,
          firstHit.point,
          firstHit.face?.normal,
        );
        this.bulletImpacts.push(impact);
        soundManager.playAt("hit_taken", firstHit.object, 0.65);
      }
    } else {
      // no hit: shoot the tracer out into the distance along the aim direction
      const farPoint = this.camera
        .getWorldPosition(new THREE.Vector3())
        .add(this.raycaster.ray.direction.clone().multiplyScalar(40));
      this.spawnTracer(farPoint);
    }

    this.emitState();
  }

  private resolveHitRoot(
    object: THREE.Object3D,
    roots: THREE.Object3D[],
  ): THREE.Object3D | null {
    let current: THREE.Object3D | null = object;
    while (current) {
      if (roots.includes(current)) return current;
      current = current.parent;
    }
    return null;
  }

  private triggerRecoil() {
    this.recoilOffset.z += 0.06;
    this.recoilRotation += 0.12;
  }

  private triggerMuzzleFlash() {
    this.muzzleFlashTimer = 0.05;
    (this.muzzleFlash.material as THREE.SpriteMaterial).opacity = 1;
    this.muzzleFlash.material.rotation = Math.random() * Math.PI;
  }

  private spawnTracer(hitPoint: THREE.Vector3) {
    const muzzleWorld = new THREE.Vector3();
    this.muzzleFlash.getWorldPosition(muzzleWorld);
    const direction = hitPoint.clone().sub(muzzleWorld);
    const length = direction.length();
    if (length < 0.01) return;

    const geometry = new THREE.CylinderGeometry(0.006, 0.006, length, 5, 1);
    const material = new THREE.MeshBasicMaterial({
      color: 0xfff3b0,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    const tracer = new THREE.Mesh(geometry, material);

    const midpoint = muzzleWorld.clone().add(hitPoint).multiplyScalar(0.5);
    tracer.position.copy(midpoint);
    tracer.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      direction.clone().normalize(),
    );

    this.scene.add(tracer);
    this.tracers.push({ mesh: tracer, life: 0.08 });
  }

  private updateWeaponView(delta: number) {
    if (this.weaponModels.length === 0) return;
    const activeModel = this.weaponModels[this.currentSlot];

    // spring the recoil back to rest
    this.recoilOffset.z = THREE.MathUtils.damp(
      this.recoilOffset.z,
      0,
      14,
      delta,
    );
    this.recoilRotation = THREE.MathUtils.damp(
      this.recoilRotation,
      0,
      14,
      delta,
    );

    activeModel.position.set(
      this.weaponRestPosition.x,
      this.weaponRestPosition.y,
      this.weaponRestPosition.z + this.recoilOffset.z,
    );
    activeModel.rotation.set(
      this.weaponRestRotation.x - this.recoilRotation,
      this.weaponRestRotation.y,
      this.weaponRestRotation.z,
    );

    if (this.muzzleFlashTimer > 0) {
      this.muzzleFlashTimer -= delta;
      if (this.muzzleFlashTimer <= 0) {
        (this.muzzleFlash.material as THREE.SpriteMaterial).opacity = 0;
      }
    }

    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= delta;
      const mat = t.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.max(0, t.life / 0.08);
      if (t.life <= 0) {
        this.scene.remove(t.mesh);
        t.mesh.geometry.dispose();
        mat.dispose();
        this.tracers.splice(i, 1);
      }
    }

    for (let i = this.bulletImpacts.length - 1; i >= 0; i--) {
      const alive = updateBulletImpact(
        this.bulletImpacts[i],
        delta,
        this.scene,
      );
      if (!alive) {
        this.bulletImpacts.splice(i, 1);
      }
    }
  }

  private reload() {
    if (this.reloading || this.state.playerAmmo === this.weapon.magazineSize)
      return;
    this.reloading = true;
    this.state.isReloading = true;
    soundManager.play2D(weaponSound(this.weapon.key, "reload"));
    this.emitState();

    const slotAtReloadStart = this.currentSlot;
    const magSize = this.inventory[slotAtReloadStart].magazineSize;

    setTimeout(() => {
      this.ammoPerWeapon[slotAtReloadStart] = magSize;
      if (this.currentSlot === slotAtReloadStart) {
        this.state.playerAmmo = magSize;
        this.reloading = false;
        this.state.isReloading = false;
        this.emitState();
      }
    }, RELOAD_TIME_MS);
  }

  private damageBot(amount: number) {
    if (!this.botAlive || this.botDying || this.state.matchOver || !this.bot)
      return;
    this.botHealth -= amount;

    if (this.botHealth <= 0) {
      this.botAlive = false;
      this.botDying = true;
      const attached = this.bot.model.userData.attachedWeapon as THREE.Object3D | undefined;
      if (attached) attached.visible = false;
      gameAssets.playAction(this.bot, "die", 0.15, true);
      soundManager.playAt("death", this.bot.model, 0.8);
      this.state.playerKills += 1;
      this.weaponKills[this.currentSlot] += 1;
      this.pushKillFeed("You eliminated the zombie");

      if (this.state.playerKills >= SCORE_LIMIT) {
        this.endMatch(true);
        return;
      }
      setTimeout(() => this.respawnBot(), 2000);
    } else {
      gameAssets.playAction(this.bot, "emote-no", 0.08, true);
      soundManager.playAt("hit_taken", this.bot.model, 0.7);
      setTimeout(() => {
        if (this.botAlive && this.bot) {
          gameAssets.playAction(this.bot, "walk", 0.15);
        }
      }, 350);
    }
  }

  private damagePlayer(amount: number) {
    if (this.state.isPlayerDead || this.state.matchOver) return;
    this.state.playerHealth -= amount;
    this.triggerLocalHitFlash();
    soundManager.play2D("hit_taken", 0.7);
    if (this.state.playerHealth <= 0) {
      this.state.playerHealth = 0;
      this.state.isPlayerDead = true;
      this.state.playerDeaths += 1;
      this.state.botKills += 1;
      soundManager.play2D("death");
      this.pushKillFeed("The bot got you");

      if (this.state.botKills >= SCORE_LIMIT) {
        this.endMatch(false);
        return;
      }
      this.beginRespawnCountdown();
    }
    this.emitState();
  }

  private endMatch(playerWon: boolean) {
    this.state.matchOver = true;
    this.state.playerWon = playerWon;
    this.running = false;
    soundManager.play2D(playerWon ? "match_win" : "match_lose");
    this.emitState();
  }

  private beginRespawnCountdown() {
    this.state.respawnCountdown = RESPAWN_SECONDS;
    this.emitState();
    const interval = setInterval(() => {
      this.state.respawnCountdown -= 1;
      this.emitState();
      if (this.state.respawnCountdown <= 0) {
        clearInterval(interval);
        this.respawnPlayer();
      }
    }, 1000);
  }

  private respawnPlayer() {
    this.resetPlayerPosition();
    this.state.playerHealth = PLAYER_HEALTH_MAX;
    this.currentSlot = 0;
    this.ammoPerWeapon = this.inventory.map((w) => w.magazineSize);
    this.state.playerAmmo = this.ammoPerWeapon[0];
    this.state.magazineSize = this.inventory[0].magazineSize;
    this.state.currentWeaponName = this.inventory[0].name;
    this.state.currentWeaponSlot = 0;
    this.state.isPlayerDead = false;
    this.weaponModels.forEach((model, i) => {
      model.visible = i === 0;
    });
    soundManager.play2D("respawn", 0.7);
    this.emitState();
  }

  private pushKillFeed(message: string) {
    this.state.killFeed = [message, ...this.state.killFeed].slice(0, 4);
  }

  private emitState() {
    this.onState({ ...this.state, killFeed: [...this.state.killFeed] });
  }

  getWeaponKillsBreakdown(): { key: string; kills: number }[] {
    return this.inventory.map((w, i) => ({
      key: w.key,
      kills: this.weaponKills[i],
    }));
  }

  // ---------- movement ----------

  private updatePlayerMovement(delta: number) {
    if (this.state.isPlayerDead) return;

    const forward = new THREE.Vector3(
      Math.sin(this.yaw),
      0,
      Math.cos(this.yaw),
    ).negate();
    const right = new THREE.Vector3(
      Math.sin(this.yaw + Math.PI / 2),
      0,
      Math.cos(this.yaw + Math.PI / 2),
    ).negate();

    this.velocity.set(0, 0, 0);
    if (this.keys[this.settings.keyForward]) this.velocity.add(forward);
    if (this.keys[this.settings.keyBackward]) this.velocity.sub(forward);
    if (this.keys[this.settings.keyRight]) this.velocity.add(right);
    if (this.keys[this.settings.keyLeft]) this.velocity.sub(right);

    if (this.velocity.lengthSq() > 0 && this.isGrounded) {
      this.velocity.normalize().multiplyScalar(PLAYER_SPEED * delta);
      const next = this.camera.position.clone().add(this.velocity);
      resolveMovementCollision(next, PLAYER_RADIUS, 3);
      const bound = BOUNDARY_LIMIT;
      next.x = Math.max(-bound, Math.min(bound, next.x));
      next.z = Math.max(-bound, Math.min(bound, next.z));
      this.camera.position.x = next.x;
      this.camera.position.z = next.z;
      soundManager.loopAt("local-footsteps", "footstep_run", null, 0.5);
    } else {
      soundManager.stopLoop("local-footsteps");
    }

    this.verticalVelocity += GRAVITY * delta;
    this.camera.position.y += this.verticalVelocity * delta;

    if (this.camera.position.y <= GROUND_Y) {
      this.camera.position.y = GROUND_Y;
      this.verticalVelocity = 0;
      if (!this.isGrounded) soundManager.play2D("land", 0.5);
      this.isGrounded = true;
    }
  }

  // ---------- bot AI ----------

  private updateBot(delta: number) {
    if (!this.bot) return;
    if (this.botDying) {
      this.bot.mixer.update(delta);
      return;
    }
    if (!this.botAlive) return;

    this.botRetargetTimer -= delta;
    if (this.botRetargetTimer <= 0) {
      this.botRetargetTimer = 1.5 + Math.random() * 1.5;
      const angle = Math.random() * Math.PI * 2;
      const radius = 3 + Math.random() * 6;
      this.botTarget.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
    }

    const model = this.bot.model;
    const toTarget = this.botTarget.clone().sub(model.position);
    toTarget.y = 0;
    const moving = toTarget.lengthSq() > 0.1;

    if (moving) {
      toTarget.normalize().multiplyScalar(BOT_SPEED * delta);
      model.position.add(toTarget);
      resolveMovementCollision(model.position, PLAYER_RADIUS, 2);
      model.position.x = Math.max(-BOUNDARY_LIMIT, Math.min(BOUNDARY_LIMIT, model.position.x));
      model.position.z = Math.max(-BOUNDARY_LIMIT, Math.min(BOUNDARY_LIMIT, model.position.z));
      gameAssets.playAction(this.bot, "sprint", 0.2);
      soundManager.loopAt("bot-footsteps", "footstep_run", model, 0.7);
    } else {
      gameAssets.playAction(this.bot, "holding-right", 0.2);
      soundManager.stopLoop("bot-footsteps");
    }

    model.lookAt(
      this.camera.position.x,
      model.position.y,
      this.camera.position.z,
    );

    const now = performance.now();
    if (now - this.botLastShotTime > BOT_FIRE_INTERVAL_MS) {
      this.botLastShotTime = now;
      if (this.hasLineOfSightToPlayer()) {
        this.triggerBotMuzzleFlash();
        soundManager.playAt("fire_rifle", model, 0.9, 10);
        const distance = model.position.distanceTo(this.camera.position);
        const hitChance = Math.max(0.15, 0.75 - distance * 0.03);
        if (Math.random() < hitChance) this.damagePlayer(BOT_DAMAGE);
      }
    }

    this.bot.mixer.update(delta);
  }

  private triggerBotMuzzleFlash() {
    const flash = this.bot?.model.userData.muzzleFlash as
      | THREE.Sprite
      | undefined;
    if (!flash) return;
    (flash.material as THREE.SpriteMaterial).opacity = 1;
    setTimeout(() => {
      (flash.material as THREE.SpriteMaterial).opacity = 0;
    }, 90);
  }

  private hasLineOfSightToPlayer(): boolean {
    if (!this.bot) return false;
    const origin = this.bot.model.position.clone();
    origin.y = 1.1;
    const target = this.camera.position.clone();
    const direction = target.clone().sub(origin);
    const distance = direction.length();
    direction.normalize();

    this.raycaster.set(origin, direction);
    this.raycaster.far = distance;
    const blocked = this.raycaster.intersectObjects(this.obstacles, true);
    return blocked.length === 0;
  }

  // ---------- loop ----------

  async start() {
    console.log("start() called");
    this.running = true;
    await this.ready;
    console.log("assets ready, running =", this.running);
    if (!this.running) return; // disposed while assets were still loading
    this.loop();
  }

  private loop = () => {
    if (!this.running) return;
    this.animationId = requestAnimationFrame(this.loop);
    const delta = Math.min(this.clock.getDelta(), 0.1);

    this.updatePlayerMovement(delta);
    this.updateBot(delta);
    this.updateWeaponView(delta);

    this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    this.running = false;
    cancelAnimationFrame(this.animationId);
    window.removeEventListener("resize", this.handleResize);
    this.canvas.removeEventListener("mousedown", this.handleMouseDown);
    document.removeEventListener("mousemove", this.handleMouseMove);
    document.removeEventListener("keydown", this.handleKeyDown);
    document.removeEventListener("keyup", this.handleKeyUp);
    document.removeEventListener(
      "pointerlockchange",
      this.handlePointerLockChange,
    );
    document.removeEventListener(
      "pointerlockerror",
      this.handlePointerLockError,
    );
    this.hitFlashEl?.remove();
    for (const impact of this.bulletImpacts) {
      const data = impact.group.userData;
      if (data) {
        data.sparkGeo?.dispose();
        data.sparkMat?.dispose();
        data.flashMat?.dispose();
      }
      this.scene.remove(impact.group);
    }
    this.bulletImpacts = [];
    soundManager.stopAllLoops();
    this.renderer.dispose();
  }
}
