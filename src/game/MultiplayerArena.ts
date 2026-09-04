import * as THREE from "three";
import { Socket } from "socket.io-client";
import {
  GameSettings,
  WeaponConfig,
  WeaponInventory,
  DEFAULT_SETTINGS,
} from "./ArenaGame";
import {
  gameAssets,
  ASSET_PATHS,
  CharacterInstance,
  pickCharacterPath,
  WEAPON_ASSET_BY_KEY,
  attachWeaponToCharacter,
  createMuzzleFlashSprite,
  spawnTracer,
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
  ARENA_HALF_SIZE,
  BOUNDARY_LIMIT,
  EYE_HEIGHT,
  PLAYER_RADIUS,
} from "./arena/ArenaLayout";
import { soundManager, weaponSound } from "./audio/SoundManager";

interface RemotePlayer {
  character: CharacterInstance;
  targetPos: THREE.Vector3;
  weaponModel: THREE.Object3D | null;
  muzzleFlash: THREE.Sprite;
  currentWeaponKey: string;
  lastAmmo: number;
  lastHealth: number;
  moving: boolean;
  lastY: number;
  wasAlive: boolean;
}

export interface MultiplayerState {
  connectionStatus:
    | "connecting"
    | "queued"
    | "matched"
    | "disconnected"
    | "error";
  myHealth: number;
  myAmmo: number;
  isReloading: boolean;
  myKills: number;
  myDeaths: number;
  opponentUsername: string;
  opponentHealth: number;
  opponentKills: number;
  isDead: boolean;
  respawnCountdown: number;
  killFeed: string[];
  matchOver: boolean;
  won: boolean;
  weaponBreakdown: { weaponKey: string; kills: number }[];
}

type StateListener = (state: MultiplayerState) => void;

const PLAYER_SPEED = 5.5;
const GRAVITY = -18;
const JUMP_SPEED = 6.5;
const RELOAD_TIME_MS = 1500;
const MOVE_SEND_INTERVAL_MS = 50;

const DEFAULT_INVENTORY: WeaponInventory = {
  primary: {
    key: "rifle",
    name: "Assault Rifle",
    damage: 20,
    fireRate: 750,
    magazineSize: 30,
  },
  secondary: {
    key: "pistol",
    name: "Combat Pistol",
    damage: 25,
    fireRate: 400,
    magazineSize: 12,
  },
  melee: {
    key: "knife",
    name: "Combat Knife",
    damage: 75,
    fireRate: 150,
    magazineSize: 1,
  },
};

export class MultiplayerArena {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private clock = new THREE.Clock();
  private animationId = 0;
  private canvas: HTMLCanvasElement;
  private running = false;
  private socket: Socket;

  private yaw = 0;
  private pitch = 0;
  private velocity = new THREE.Vector3();
  private verticalVelocity = 0;
  private isGrounded = true;
  private keys: Record<string, boolean> = {};
  private lastShotTime = 0;
  private lastMoveSent = 0;
  private reloading = false;
  private settings: GameSettings;

  private inventory: WeaponConfig[];
  private ammoPerWeapon: number[];
  private currentSlot = 0;
  private lastSlot = 0;

  private weaponRig = new THREE.Group();
  private weaponModels: THREE.Object3D[] = [];
  private weaponRestPosition = new THREE.Vector3(0.28, -0.24, -0.55);
  private weaponRestRotation = new THREE.Euler(0, Math.PI, 0);
  private recoilOffset = new THREE.Vector3();
  private recoilRotation = 0;
  private muzzleFlash!: THREE.Sprite;
  private muzzleFlashTimer = 0;
  private tracers: { mesh: THREE.Mesh; life: number }[] = [];
  private assetsReady: Promise<void>;

  private static readonly WEAPON_ASSET_BY_SLOT = [
    ASSET_PATHS.rifleWeapon,
    ASSET_PATHS.pistolWeapon,
    ASSET_PATHS.knifeWeapon,
  ];

  private get weapon(): WeaponConfig {
    return this.inventory[this.currentSlot];
  }

  private remotePlayers = new Map<string, RemotePlayer>();
  private pendingSpawns = new Set<string>();
  private obstacles: THREE.Object3D[] = [];
  private boundaryWalls: THREE.Mesh[] = [];
  private bulletImpacts: BulletImpact[] = [];
  private hitFlashEl: HTMLDivElement | null = null;
  private deathVignetteEl: HTMLDivElement | null = null;
  private deathCamTimer = 0;
  private deathRoll = 0;
  private targetDeathRoll = 0;

  private state: MultiplayerState = {
    connectionStatus: "connecting",
    myHealth: 100,
    myAmmo: 30,
    isReloading: false,
    myKills: 0,
    myDeaths: 0,
    opponentUsername: "",
    opponentHealth: 100,
    opponentKills: 0,
    isDead: false,
    respawnCountdown: 0,
    killFeed: [],
    matchOver: false,
    won: false,
    weaponBreakdown: [],
  };
  private onState: StateListener;
  private myUserId: string | null = null;

  constructor(
    canvas: HTMLCanvasElement,
    socket: Socket,
    onState: StateListener,
    roomCode?: string,
    inventory: WeaponInventory = DEFAULT_INVENTORY,
    settings: GameSettings = DEFAULT_SETTINGS,
  ) {
    this.canvas = canvas;
    this.onState = onState;
    this.socket = socket;
    this.settings = settings;
    this.inventory = [inventory.primary, inventory.secondary, inventory.melee];
    this.ammoPerWeapon = this.inventory.map((w) => w.magazineSize);
    this.state.myAmmo = this.ammoPerWeapon[0];

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x8fd0f0);
    this.scene.fog = new THREE.Fog(0x9fdcff, 35, 90);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;

    this.camera = new THREE.PerspectiveCamera(
      78,
      canvas.clientWidth / canvas.clientHeight,
      0.1,
      1000,
    );

    const startSpawn = getSafeSpawnPoint();
    this.camera.position.set(startSpawn.x, EYE_HEIGHT, startSpawn.z);
    this.yaw = startSpawn.yaw;
    this.camera.quaternion.setFromEuler(new THREE.Euler(0, this.yaw, 0, "YXZ"));

    this.camera.add(this.weaponRig);
    this.scene.add(this.camera);
    soundManager.attachListener(this.camera);
    this.muzzleFlash = createMuzzleFlashSprite();
    this.muzzleFlash.position.set(
      this.weaponRestPosition.x,
      this.weaponRestPosition.y + 0.02,
      this.weaponRestPosition.z - 0.55,
    );
    this.weaponRig.add(this.muzzleFlash);

    this.assetsReady = Promise.all([
      this.loadLocalWeapons(),
      this.loadEnvironmentProps(),
      soundManager.preloadAll(),
    ]).then(() => undefined);

    this.buildArena();
    this.setupLights();

    window.addEventListener("resize", this.handleResize);
    canvas.addEventListener("mousedown", this.handleMouseDown);
    document.addEventListener("mousemove", this.handleMouseMove);
    document.addEventListener("keydown", this.handleKeyDown);
    document.addEventListener("keyup", this.handleKeyUp);

    this.registerSocketHandlers(roomCode);
  }

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

  private async loadLocalWeapons() {
    const bases = await Promise.all(
      MultiplayerArena.WEAPON_ASSET_BY_SLOT.map((path) =>
        gameAssets.loadProp(path),
      ),
    );
    this.weaponModels = bases.map((base, i) => {
      const model = gameAssets.spawnProp(base);
      model.scale.setScalar(0.9);
      model.position.copy(this.weaponRestPosition);
      model.rotation.copy(this.weaponRestRotation);
      model.visible = i === this.currentSlot;
      this.weaponRig.add(model);
      return model;
    });
  }

  setMyUserId(userId: string) {
    this.myUserId = userId;
  }

  private registerSocketHandlers(roomCode?: string) {
    const startFlow = () => {
      this.updateState({ connectionStatus: "queued" });
      if (roomCode) {
        this.socket.emit("match:enter", { roomCode });
      } else {
        this.socket.emit("queue:join", {
          inventory: this.inventory.map((w) => ({
            key: w.key,
            damage: w.damage,
            fireRate: w.fireRate,
            magazineSize: w.magazineSize,
          })),
        });
      }
    };

    if (this.socket.connected) {
      startFlow();
    } else {
      this.socket.once("connect", startFlow);
    }

    this.socket.on("connect_error", () =>
      this.updateState({ connectionStatus: "error" }),
    );
    this.socket.on("room:error", () =>
      this.updateState({ connectionStatus: "error" }),
    );
    this.socket.on("queue:waiting", () =>
      this.updateState({ connectionStatus: "queued" }),
    );

    this.socket.on(
      "match:found",
      (data?: {
        roomId: string;
        players?: {
          id: string;
          username: string;
          x?: number;
          y?: number;
          z?: number;
          yaw?: number;
        }[];
      }) => {
        this.updateState({ connectionStatus: "matched" });
        const me = data?.players?.find((p) => p.id === this.myUserId);
        if (me && me.x !== undefined && me.z !== undefined) {
          this.camera.position.set(me.x, EYE_HEIGHT, me.z);
          this.yaw = me.yaw ?? 0;
          this.camera.quaternion.setFromEuler(
            new THREE.Euler(0, this.yaw, 0, "YXZ"),
          );
        }
        this.start();
      },
    );

    this.socket.on(
      "state:update",
      (data: {
        players: {
          id: string;
          username: string;
          x: number;
          y: number;
          z: number;
          yaw: number;
          health: number;
          ammo: number;
          weaponKey?: string;
          kills: number;
          deaths: number;
          alive: boolean;
        }[];
      }) => this.applyStateUpdate(data.players),
    );

    this.socket.on(
      "player:damaged",
      (data: { targetId: string; health: number }) => {
        if (data.targetId === this.myUserId) {
          this.updateState({ myHealth: data.health });
          this.triggerLocalHitFlash("taken");
          soundManager.play2D("hit_taken", 0.7);
        } else {
          this.updateState({ opponentHealth: data.health });
          const remote = this.remotePlayers.get(data.targetId);
          if (remote && data.health > 0 && remote.wasAlive) {
            gameAssets.playAction(remote.character, "emote-no", 0.08, true);
            setTimeout(() => {
              if (!remote.wasAlive) return;
              if (remote.moving)
                gameAssets.playAction(remote.character, "sprint", 0.15);
              else gameAssets.playAction(remote.character, "holding-right", 0.15);
            }, 350);
          }
          this.triggerLocalHitFlash("landed"); // confirms YOUR shot connected
          soundManager.play2D("hit_landed", 0.6);
        }
      },
    );

    this.socket.on(
      "player:eliminated",
      (data: { targetId: string; byId: string; byUsername?: string }) => {
        if (data.targetId === this.myUserId) {
          this.pushKillFeed(`${data.byUsername ?? "Opponent"} eliminated you`);
          this.triggerLocalDeath();
        } else {
          this.pushKillFeed(`You eliminated ${this.state.opponentUsername}`);
          this.updateState({ opponentHealth: 0 });
          soundManager.play2D("kill_confirm", 0.8);
          this.triggerRemoteDeath(data.targetId);
        }
      },
    );

    this.socket.on(
      "player:respawned",
      (data: { userId: string; x: number; y: number; z: number; yaw?: number }) => {
        if (data.userId === this.myUserId) {
          this.triggerLocalRespawn(data.x, data.y, data.z, data.yaw);
        } else {
          this.triggerRemoteRespawn(data.userId, data.x, data.z, data.yaw);
        }
      },
    );

    this.socket.on(
      "match:end",
      (data: {
        winnerId: string;
        results: {
          userId: string;
          kills: number;
          deaths: number;
          won: boolean;
          weapons: { weaponKey: string; kills: number }[];
        }[];
      }) => {
        const me = data.results.find((r) => r.userId === this.myUserId);
        this.running = false;
        this.updateState({
          matchOver: true,
          won: !!me?.won,
          myKills: me?.kills ?? this.state.myKills,
          myDeaths: me?.deaths ?? this.state.myDeaths,
          weaponBreakdown: me?.weapons ?? [],
        });
        soundManager.play2D(me?.won ? "match_win" : "match_lose");
      },
    );

    this.socket.on("disconnect", () =>
      this.updateState({ connectionStatus: "disconnected" }),
    );
  }

  private triggerLocalDeath() {
    this.deathCamTimer = 0;
    this.targetDeathRoll = (Math.random() < 0.5 ? -1 : 1) * 0.45; // ~26 deg tilt
    this.updateState({ isDead: true, myHealth: 0, respawnCountdown: 3 });
    soundManager.play2D("death");
    soundManager.stopLoop("local-footsteps");
    this.setDeathVignette(true);
    this.beginLocalRespawnCountdown();
  }

  private triggerLocalRespawn(x: number, y: number, z: number, yaw?: number) {
    this.deathCamTimer = 0;
    this.deathRoll = 0;
    this.camera.position.set(x, EYE_HEIGHT, z);
    if (yaw !== undefined) {
      this.yaw = yaw;
    }
    this.pitch = 0;
    this.camera.quaternion.setFromEuler(new THREE.Euler(0, this.yaw, 0, "YXZ"));
    this.weaponRig.visible = true;
    this.weaponRig.position.set(0, 0, 0);
    this.verticalVelocity = 0;
    this.isGrounded = true;
    this.currentSlot = 0;
    this.ammoPerWeapon = this.inventory.map((w) => w.magazineSize);
    this.setDeathVignette(false);
    this.updateState({
      isDead: false,
      myHealth: 100,
      myAmmo: this.ammoPerWeapon[0],
    });
    soundManager.play2D("respawn", 0.7);
  }

  private triggerRemoteDeath(targetId: string) {
    const remote = this.remotePlayers.get(targetId);
    if (!remote || !remote.wasAlive) return;
    remote.wasAlive = false;
    remote.moving = false;
    soundManager.stopLoop(`remote-footsteps-${targetId}`);
    soundManager.playAt("death", remote.character.model, 0.85, 12);
    if (remote.weaponModel) {
      remote.weaponModel.visible = false;
    }
    gameAssets.playDeath(remote.character);
  }

  private triggerRemoteRespawn(
    userId: string,
    x: number,
    z: number,
    yaw?: number,
  ) {
    const remote = this.remotePlayers.get(userId);
    if (!remote) return;
    remote.character.model.position.set(x, 0, z);
    remote.targetPos.set(x, 0, z);
    if (yaw !== undefined) {
      remote.character.model.rotation.y = yaw + Math.PI;
    }
    remote.wasAlive = true;
    remote.moving = false;
    remote.character.model.visible = true;
    if (remote.weaponModel) {
      remote.weaponModel.visible = true;
    }
    gameAssets.resetCharacterAfterDeath(remote.character, "holding-right");
  }

  private setDeathVignette(show: boolean) {
    if (!this.deathVignetteEl) {
      const el = document.createElement("div");
      el.style.cssText =
        "position:fixed;inset:0;pointer-events:none;z-index:35;opacity:0;transition:opacity 0.35s ease-out;";
      el.style.background =
        "radial-gradient(circle at center, rgba(140, 0, 0, 0.2) 20%, rgba(90, 0, 0, 0.75) 100%)";
      this.canvas.parentElement?.appendChild(el);
      this.deathVignetteEl = el;
    }
    this.deathVignetteEl.style.opacity = show ? "1" : "0";
  }

  private triggerLocalHitFlash(kind: "landed" | "taken") {
    if (!this.hitFlashEl) {
      const el = document.createElement("div");
      el.style.cssText =
        "position:fixed;inset:0;pointer-events:none;z-index:25;opacity:0;transition:opacity 60ms;";
      this.canvas.parentElement?.appendChild(el);
      this.hitFlashEl = el;
    }
    this.hitFlashEl.style.background =
      kind === "landed"
        ? "radial-gradient(circle, transparent 60%, rgba(255,0,0,0) 100%)"
        : "radial-gradient(circle, transparent 40%, rgba(255,0,0,0.35) 100%)";
    this.hitFlashEl.style.opacity = "1";
    setTimeout(() => {
      if (this.hitFlashEl) this.hitFlashEl.style.opacity = "0";
    }, 100);
  }

  private applyStateUpdate(
    players: {
      id: string;
      username: string;
      x: number;
      y: number;
      z: number;
      yaw: number;
      health: number;
      ammo: number;
      weaponKey?: string;
      kills: number;
      deaths: number;
      alive: boolean;
    }[],
  ) {
    const activeIds = new Set<string>();

    for (const p of players) {
      if (p.id === this.myUserId) {
        this.updateState({
          myHealth: p.health,
          myKills: p.kills,
          myDeaths: p.deaths,
        });
        continue;
      }

      activeIds.add(p.id);
      let remote = this.remotePlayers.get(p.id);
      if (!remote) {
        this.updateState({ opponentUsername: p.username });
        if (!this.pendingSpawns.has(p.id)) {
          this.pendingSpawns.add(p.id);
          this.spawnRemotePlayer(p.id, p.weaponKey ?? "rifle", p.x, p.z, p.yaw);
        }
        continue;
      }

      // If remote player is already dead, check if they respawned on the server
      if (!remote.wasAlive) {
        if (p.alive) {
          this.triggerRemoteRespawn(p.id, p.x, p.z, p.yaw);
        }
        this.updateState({ opponentHealth: p.health, opponentKills: p.kills });
        continue;
      }

      // If remote player was alive and server reports dead
      if (!p.alive) {
        this.triggerRemoteDeath(p.id);
        this.updateState({ opponentHealth: p.health, opponentKills: p.kills });
        continue;
      }

      remote.targetPos.set(p.x, 0, p.z);
      remote.character.model.rotation.y = p.yaw + Math.PI;

      if (p.y > remote.lastY + 0.05 && remote.lastY <= EYE_HEIGHT + 0.05) {
        soundManager.playAt("jump", remote.character.model, 0.5, 8);
      } else if (p.y <= EYE_HEIGHT + 0.01 && remote.lastY > EYE_HEIGHT + 0.05) {
        soundManager.playAt("land", remote.character.model, 0.5, 8);
      }
      remote.lastY = p.y;

      // detect a weapon switch
      if (p.weaponKey && p.weaponKey !== remote.currentWeaponKey) {
        this.swapRemoteWeapon(remote, p.weaponKey);
        soundManager.playAt("weapon_switch", remote.character.model, 0.4, 6);
      }

      // detect a shot: ammo went down since last update -> play fire feedback
      if (p.ammo < remote.lastAmmo) {
        this.triggerRemoteMuzzleFlash(remote);
        soundManager.playAt(
          weaponSound(p.weaponKey ?? remote.currentWeaponKey, "fire"),
          remote.weaponModel ?? remote.character.model,
          0.9,
          12,
        );
      } else if (p.ammo > remote.lastAmmo) {
        soundManager.playAt(
          weaponSound(remote.currentWeaponKey, "reload"),
          remote.character.model,
          0.6,
          6,
        );
      }
      remote.lastAmmo = p.ammo;

      // detect damage taken -> hit reaction
      if (p.health < remote.lastHealth && p.health > 0) {
        gameAssets.playAction(remote.character, "emote-no", 0.08, true);
        soundManager.playAt("hit_taken", remote.character.model, 0.6, 8);
      }
      remote.lastHealth = p.health;

      this.updateState({ opponentHealth: p.health, opponentKills: p.kills });
    }

    // Clean up disconnected players
    for (const [id, remote] of this.remotePlayers) {
      if (!activeIds.has(id)) {
        this.scene.remove(remote.character.model);
        soundManager.stopLoop(`remote-footsteps-${id}`);
        this.remotePlayers.delete(id);
      }
    }
  }

  private updateWeaponView(delta: number) {
    if (this.weaponModels.length === 0) return;
    const activeModel = this.weaponModels[this.currentSlot];
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
      if (this.muzzleFlashTimer <= 0)
        (this.muzzleFlash.material as THREE.SpriteMaterial).opacity = 0;
    }
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= delta;
      (t.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(
        0,
        t.life / 0.08,
      );
      if (t.life <= 0) {
        this.scene.remove(t.mesh);
        t.mesh.geometry.dispose();
        (t.mesh.material as THREE.Material).dispose();
        this.tracers.splice(i, 1);
      }
    }

    for (let i = this.bulletImpacts.length - 1; i >= 0; i--) {
      const alive = updateBulletImpact(this.bulletImpacts[i], delta, this.scene);
      if (!alive) {
        this.bulletImpacts.splice(i, 1);
      }
    }
  }

  private async spawnRemotePlayer(
    id: string,
    weaponKey: string,
    initX = 0,
    initZ = 0,
    initYaw = 0,
  ) {
    if (this.remotePlayers.has(id)) return;
    try {
      const characterPath = pickCharacterPath(id);
      const [charBase, weaponBase] = await Promise.all([
        gameAssets.loadCharacter(characterPath),
        gameAssets.loadProp(
          WEAPON_ASSET_BY_KEY[weaponKey] ?? WEAPON_ASSET_BY_KEY.rifle,
        ),
      ]);
      if (this.remotePlayers.has(id)) return;

      const character = gameAssets.spawnCharacter(charBase);
      character.model.scale.setScalar(0.65);
      character.model.position.set(initX, 0, initZ);
      character.model.rotation.y = initYaw + Math.PI;

      // CRITICAL: Disable frustum culling on all character meshes to prevent random disappearance!
      character.model.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          obj.frustumCulled = false;
          obj.castShadow = true;
          obj.receiveShadow = true;
        }
      });

      const weaponModel = gameAssets.spawnProp(weaponBase);
      attachWeaponToCharacter(character, weaponModel, weaponKey);

      const muzzleFlash = createMuzzleFlashSprite();
      muzzleFlash.position.set(0, 0.05, -0.6);
      weaponModel.add(muzzleFlash);

      // DIRECTLY ADD TO SCENE — NO PARENT GROUP OFFSET!
      this.scene.add(character.model);
      gameAssets.playAction(character, "holding-right", 0.1);

      this.remotePlayers.set(id, {
        character,
        targetPos: new THREE.Vector3(initX, 0, initZ),
        weaponModel,
        muzzleFlash,
        currentWeaponKey: weaponKey,
        lastAmmo: Infinity,
        lastHealth: 100,
        moving: false,
        lastY: EYE_HEIGHT,
        wasAlive: true,
      });
    } finally {
      this.pendingSpawns.delete(id);
    }
  }

  private swapRemoteWeapon(remote: RemotePlayer, weaponKey: string) {
    gameAssets
      .loadProp(WEAPON_ASSET_BY_KEY[weaponKey] ?? WEAPON_ASSET_BY_KEY.rifle)
      .then((base) => {
        const weaponModel = gameAssets.spawnProp(base);
        attachWeaponToCharacter(remote.character, weaponModel, weaponKey);
        const muzzleFlash = createMuzzleFlashSprite();
        muzzleFlash.position.set(0, 0.05, -0.6);
        weaponModel.add(muzzleFlash);
        remote.weaponModel = weaponModel;
        remote.muzzleFlash = muzzleFlash;
        remote.currentWeaponKey = weaponKey;
      });
  }

  private triggerRemoteMuzzleFlash(remote: RemotePlayer) {
    (remote.muzzleFlash.material as THREE.SpriteMaterial).opacity = 1;
    setTimeout(() => {
      (remote.muzzleFlash.material as THREE.SpriteMaterial).opacity = 0;
    }, 90);
  }

  private buildArena() {
    // Underlying asphalt base plane
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
    this.scene.add(sun);

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.35));
  }

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
    if (!this.isGrounded || this.state.isDead) return;
    this.verticalVelocity = JUMP_SPEED;
    this.isGrounded = false;
    soundManager.play2D("jump", 0.6);
  }

  private switchToSlot(slot: number) {
    if (slot === this.currentSlot || this.state.isDead || slot < 0 || slot > 2)
      return;
    soundManager.play2D("weapon_switch", 0.5);
    this.lastSlot = this.currentSlot;
    this.currentSlot = slot;
    this.reloading = false;
    this.updateState({ isReloading: false, myAmmo: this.ammoPerWeapon[slot] });
    this.weaponModels.forEach((model, i) => {
      model.visible = i === slot;
    });
    this.socket.emit("player:switchWeapon", { slot });
  }

  private quickSwitch() {
    this.switchToSlot(this.lastSlot);
  }

  private handleMouseMove = (e: MouseEvent) => {
    if (document.pointerLockElement !== this.canvas || this.state.isDead) return;
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
      this.canvas.requestPointerLock();
      return;
    }
    this.shoot();
  };

  private handleResize = () => {
    const { clientWidth, clientHeight } = this.canvas;
    this.camera.aspect = clientWidth / clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(clientWidth, clientHeight);
  };

  private shoot() {
    if (this.state.isDead || this.reloading || this.state.matchOver) return;
    const now = performance.now();
    const fireIntervalMs = 60000 / this.weapon.fireRate;
    if (now - this.lastShotTime < fireIntervalMs) return;
    if (this.state.myAmmo <= 0) {
      soundManager.play2D("dry_fire", 0.5);
      this.reload();
      return;
    }
    this.lastShotTime = now;

    const direction = new THREE.Vector3();
    this.camera.getWorldDirection(direction);

    this.recoilOffset.z += 0.06;
    this.recoilRotation += 0.12;
    this.muzzleFlashTimer = 0.05;
    (this.muzzleFlash.material as THREE.SpriteMaterial).opacity = 1;
    soundManager.play2D(weaponSound(this.weapon.key, "fire"));

    const muzzleWorld = new THREE.Vector3();
    this.muzzleFlash.getWorldPosition(muzzleWorld);

    // Raycast to determine what bullet hits first (remote players, obstacles, or walls)
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);

    const remoteModels: THREE.Object3D[] = [];
    for (const remote of this.remotePlayers.values()) {
      if (remote.wasAlive && remote.character.model.visible) {
        remoteModels.push(remote.character.model);
      }
    }
    const allTargets = [...remoteModels, ...this.obstacles, ...this.boundaryWalls];
    const hits = raycaster.intersectObjects(allTargets, true);

    let endPoint = muzzleWorld.clone().add(direction.clone().multiplyScalar(40));

    if (hits.length > 0) {
      const firstHit = hits[0];
      endPoint = firstHit.point;

      let isPlayerHit = false;
      let cur: THREE.Object3D | null = firstHit.object;
      while (cur) {
        if (remoteModels.includes(cur)) {
          isPlayerHit = true;
          break;
        }
        cur = cur.parent;
      }

      if (!isPlayerHit) {
        // Bullet hit an obstacle or wall: spawn impact effect and play sound
        const impact = spawnBulletImpact(this.scene, firstHit.point, firstHit.face?.normal);
        this.bulletImpacts.push(impact);
        soundManager.playAt("hit_taken", firstHit.object, 0.5, 12);
      }
    }

    const tracer = spawnTracer(this.scene, muzzleWorld, endPoint);
    if (tracer) this.tracers.push(tracer);

    this.socket.emit("player:shoot", {
      origin: {
        x: this.camera.position.x,
        y: this.camera.position.y,
        z: this.camera.position.z,
      },
      direction: { x: direction.x, y: direction.y, z: direction.z },
    });

    this.ammoPerWeapon[this.currentSlot] = Math.max(
      0,
      this.ammoPerWeapon[this.currentSlot] - 1,
    );
    this.updateState({ myAmmo: this.ammoPerWeapon[this.currentSlot] });
  }

  private reload() {
    if (this.reloading || this.state.myAmmo === this.weapon.magazineSize)
      return;
    this.reloading = true;
    this.updateState({ isReloading: true });
    soundManager.play2D(weaponSound(this.weapon.key, "reload")); 
    this.socket.emit("player:reload");

    const slotAtReloadStart = this.currentSlot;
    const magSize = this.inventory[slotAtReloadStart].magazineSize;

    setTimeout(() => {
      this.ammoPerWeapon[slotAtReloadStart] = magSize;
      this.reloading = false;
      if (this.currentSlot === slotAtReloadStart) {
        this.updateState({ isReloading: false, myAmmo: magSize });
      }
    }, RELOAD_TIME_MS);
  }

  private beginLocalRespawnCountdown() {
    const interval = setInterval(() => {
      const next = Math.max(0, this.state.respawnCountdown - 1);
      this.updateState({ respawnCountdown: next });
      if (next <= 0) clearInterval(interval);
    }, 1000);
  }

  private pushKillFeed(message: string) {
    this.updateState({
      killFeed: [message, ...this.state.killFeed].slice(0, 4),
    });
  }

  private updateState(partial: Partial<MultiplayerState>) {
    this.state = { ...this.state, ...partial };
    this.onState({ ...this.state, killFeed: [...this.state.killFeed] });
  }

  private updatePlayerMovement(delta: number) {
    if (this.state.isDead) {
      this.deathCamTimer += delta;
      const t = Math.min(1, this.deathCamTimer / 0.45);
      const ease = 1 - Math.pow(1 - t, 3);
      this.camera.position.y = THREE.MathUtils.lerp(EYE_HEIGHT, 0.32, ease);
      this.deathRoll = THREE.MathUtils.lerp(0, this.targetDeathRoll, ease);
      this.camera.quaternion.setFromEuler(
        new THREE.Euler(this.pitch, this.yaw, this.deathRoll, "YXZ"),
      );
      this.weaponRig.position.y = THREE.MathUtils.lerp(0, -0.65, ease);
      if (t >= 0.85) {
        this.weaponRig.visible = false;
      }
      return;
    }

    const forward = new THREE.Vector3(
      Math.sin(this.yaw),
      0,
      Math.cos(this.yaw),
    ).negate();
    const right = new THREE.Vector3(
      Math.sin(this.yaw + Math.PI / 2),
      0,
      Math.cos(this.yaw + Math.PI / 2),
    );

    this.velocity.set(0, 0, 0);
    if (this.keys[this.settings.keyForward]) this.velocity.add(forward);
    if (this.keys[this.settings.keyBackward]) this.velocity.sub(forward);
    if (this.keys[this.settings.keyRight]) this.velocity.add(right);
    if (this.keys[this.settings.keyLeft]) this.velocity.sub(right);

    if (this.velocity.lengthSq() > 0) {
      this.velocity.normalize().multiplyScalar(PLAYER_SPEED * delta);
      const next = this.camera.position.clone().add(this.velocity);

      resolveMovementCollision(next, PLAYER_RADIUS, 3);
      next.x = Math.max(-BOUNDARY_LIMIT, Math.min(BOUNDARY_LIMIT, next.x));
      next.z = Math.max(-BOUNDARY_LIMIT, Math.min(BOUNDARY_LIMIT, next.z));
      this.camera.position.x = next.x;
      this.camera.position.z = next.z;
      if (this.isGrounded) soundManager.loopAt("local-footsteps", "footstep_run", null, 0.5);
    } else {
      soundManager.stopLoop("local-footsteps");
    }

    this.verticalVelocity += GRAVITY * delta;
    this.camera.position.y += this.verticalVelocity * delta;
    if (this.camera.position.y <= EYE_HEIGHT) {
      this.camera.position.y = EYE_HEIGHT;
      this.verticalVelocity = 0;
      if (!this.isGrounded) soundManager.play2D("land", 0.5);
      this.isGrounded = true;
    }
  }

  private sendMovementIfDue() {
    if (this.state.isDead) return;
    const now = performance.now();
    if (now - this.lastMoveSent < MOVE_SEND_INTERVAL_MS) return;
    this.lastMoveSent = now;
    this.socket.emit("player:move", {
      x: this.camera.position.x,
      y: this.camera.position.y,
      z: this.camera.position.z,
      yaw: this.yaw,
    });
  }

  private interpolateRemotePlayers(delta: number) {
    for (const [id, remote] of this.remotePlayers) {
      if (!remote.wasAlive) {
        remote.character.mixer.update(delta);
        continue;
      }

      const before = remote.character.model.position.clone();
      remote.character.model.position.lerp(
        remote.targetPos,
        Math.min(1, delta * 15),
      );
      // Strictly enforce feet on ground
      remote.character.model.position.y = 0;

      const moved = remote.character.model.position.distanceTo(before) > 0.005;
      if (moved !== remote.moving) {
        remote.moving = moved;
        gameAssets.playAction(
          remote.character,
          moved ? "sprint" : "holding-right",
          0.2,
        );
        if (moved) {
          soundManager.loopAt(`remote-footsteps-${id}`, "footstep_run", remote.character.model, 0.6);
        } else {
          soundManager.stopLoop(`remote-footsteps-${id}`);
        }
      }
      remote.character.mixer.update(delta);
    }
  }

  async start() {
    this.running = true;
    await this.assetsReady;
    if (!this.running) return;
    this.loop();
  }

  private loop = () => {
    if (!this.running) return;
    this.animationId = requestAnimationFrame(this.loop);
    const delta = Math.min(this.clock.getDelta(), 0.1);

    this.updatePlayerMovement(delta);
    this.sendMovementIfDue();
    this.interpolateRemotePlayers(delta);
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
    this.socket.removeAllListeners();
    this.hitFlashEl?.remove();
    this.deathVignetteEl?.remove();
    for (const remote of this.remotePlayers.values()) {
      this.scene.remove(remote.character.model);
    }
    this.remotePlayers.clear();
    this.pendingSpawns.clear();
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
