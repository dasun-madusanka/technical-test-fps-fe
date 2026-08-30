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
} from "./assets/GameAssets";

interface RemotePlayer {
  character: CharacterInstance;
  targetPos: THREE.Vector3;
  weaponModel: THREE.Object3D | null;
  muzzleFlash: THREE.Sprite;
  currentWeaponKey: string;
  lastAmmo: number;
  lastHealth: number;
  moving: boolean;
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

const ARENA_HALF_SIZE = 15;
const PLAYER_SPEED = 5.5;
const PLAYER_HEIGHT = 1.6;
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

  private opponentMesh: THREE.Mesh | null = null;
  private opponentTargetPos = new THREE.Vector3();

  private remotePlayers = new Map<string, RemotePlayer>();
  private obstacles: THREE.Object3D[] = [];

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
    this.scene.background = new THREE.Color(0x05060a);
    this.scene.fog = new THREE.Fog(0x05060a, 20, 55);

    this.camera = new THREE.PerspectiveCamera(
      78,
      canvas.clientWidth / canvas.clientHeight,
      0.1,
      1000,
    );
    this.camera.position.set(0, PLAYER_HEIGHT, 10);

    this.camera.add(this.weaponRig);
    this.scene.add(this.camera);
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
    const [
      barrel,
      cinderBlock,
      pallet,
      chest,
      trafficBarrier,
      trafficCone,
      containerRed,
      containerGreen,
    ] = await Promise.all([
      gameAssets.loadProp(ASSET_PATHS.barrel),
      gameAssets.loadProp(ASSET_PATHS.cinderBlock),
      gameAssets.loadProp(ASSET_PATHS.pallet),
      gameAssets.loadProp(ASSET_PATHS.chest),
      gameAssets.loadProp(ASSET_PATHS.trafficBarrier),
      gameAssets.loadProp(ASSET_PATHS.trafficCone),
      gameAssets.loadProp(ASSET_PATHS.containerRed),
      gameAssets.loadProp(ASSET_PATHS.containerGreen),
    ]);

    const coverSpots: [THREE.Group, number, number, number][] = [
      [barrel, 4, 0, 4],
      [cinderBlock, -5, 0, -3],
      [pallet, 6, 0, -6],
      [chest, -6, 0, 5],
      [trafficBarrier, 0, 0, -8],
      [barrel, -3, 0, 7],
      [cinderBlock, 3, 0, -3],
    ];
    for (const [base, x, y, z] of coverSpots) {
      const prop = gameAssets.spawnProp(base);
      prop.position.set(x, y, z);
      prop.rotation.y = Math.random() * Math.PI * 2;
      this.scene.add(prop);
      this.obstacles.push(prop);
    }

    const perimeterSpots: [number, number, number][] = [
      [-14, 0, -14],
      [14, 0, -14],
      [-14, 0, 14],
      [14, 0, 14],
    ];
    perimeterSpots.forEach(([x, y, z], i) => {
      const base = i % 2 === 0 ? containerRed : containerGreen;
      const container = gameAssets.spawnProp(base);
      container.position.set(x, y, z);
      container.rotation.y = Math.random() * Math.PI * 2;
      this.scene.add(container);
    });

    const clutterSpots: [THREE.Group, number, number][] = [
      [trafficCone, 2, 6],
      [trafficCone, -2, -6],
    ];
    for (const [base, x, z] of clutterSpots) {
      const prop = gameAssets.spawnProp(base);
      prop.position.set(x, 0, z);
      this.scene.add(prop);
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

    this.socket.on("match:found", () => {
      this.updateState({ connectionStatus: "matched" });
      this.start();
    });

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
        if (data.targetId === this.myUserId)
          this.updateState({ myHealth: data.health });
        else this.updateState({ opponentHealth: data.health });
      },
    );

    this.socket.on(
      "player:eliminated",
      (data: { targetId: string; byId: string; byUsername?: string }) => {
        if (data.targetId === this.myUserId) {
          this.pushKillFeed(`${data.byUsername ?? "Opponent"} eliminated you`);
          this.updateState({ isDead: true, myHealth: 0, respawnCountdown: 3 });
          this.beginLocalRespawnCountdown();
        } else {
          this.pushKillFeed(`You eliminated ${this.state.opponentUsername}`);
          this.updateState({ opponentHealth: 0 });
        }
      },
    );

    this.socket.on(
      "player:respawned",
      (data: { userId: string; x: number; y: number; z: number }) => {
        if (data.userId === this.myUserId) {
          this.camera.position.set(data.x, data.y, data.z);
          this.currentSlot = 0;
          this.ammoPerWeapon = this.inventory.map((w) => w.magazineSize);
          this.updateState({
            isDead: false,
            myHealth: 100,
            myAmmo: this.ammoPerWeapon[0],
          });
        } else {
          const remote = this.remotePlayers.get(data.userId);
          if (remote) {
            remote.character.model.position.set(data.x, 0, data.z);
            remote.targetPos.set(data.x, 0, data.z);
            gameAssets.playAction(remote.character, "Idle_Gun", 0.1);
          }
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
      },
    );

    this.socket.on("disconnect", () =>
      this.updateState({ connectionStatus: "disconnected" }),
    );
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
    for (const p of players) {
      if (p.id === this.myUserId) {
        this.updateState({
          myHealth: p.health,
          myKills: p.kills,
          myDeaths: p.deaths,
        });
        continue;
      }

      let remote = this.remotePlayers.get(p.id);
      if (!remote) {
        this.updateState({ opponentUsername: p.username });
        this.spawnRemotePlayer(p.id, p.weaponKey ?? "rifle"); // async, fills in remotePlayers once loaded
        continue; // skip until it's actually loaded
      }

      remote.targetPos.set(p.x, 0, p.z); // character root sits on the ground, ignore the server's eye-height y
      remote.character.model.rotation.y = p.yaw;

      // detect a weapon switch
      if (p.weaponKey && p.weaponKey !== remote.currentWeaponKey) {
        this.swapRemoteWeapon(remote, p.weaponKey);
      }

      // detect a shot: ammo went down since last update -> play fire feedback
      if (p.ammo < remote.lastAmmo) {
        this.triggerRemoteMuzzleFlash(remote);
      }
      remote.lastAmmo = p.ammo;

      // detect damage taken -> hit reaction
      if (p.health < remote.lastHealth && p.health > 0) {
        gameAssets.playAction(remote.character, "HitReact", 0.08, true);
      }
      remote.lastHealth = p.health;

      // death
      if (!p.alive) {
        gameAssets.playAction(remote.character, "Death", 0.15, true);
      }

      this.updateState({ opponentHealth: p.health, opponentKills: p.kills });
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
  }

  private async spawnRemotePlayer(id: string, weaponKey: string) {
    const characterPath = pickCharacterPath(id);
    const [charBase, weaponBase] = await Promise.all([
      gameAssets.loadCharacter(characterPath),
      gameAssets.loadProp(
        WEAPON_ASSET_BY_KEY[weaponKey] ?? WEAPON_ASSET_BY_KEY.rifle,
      ),
    ]);
    if (this.remotePlayers.has(id)) return; // race guard

    const character = gameAssets.spawnCharacter(charBase);
    const weaponModel = gameAssets.spawnProp(weaponBase);
    attachWeaponToCharacter(character, weaponModel, weaponKey);

    const muzzleFlash = createMuzzleFlashSprite();
    muzzleFlash.position.set(0, 0.05, -0.6);
    weaponModel.add(muzzleFlash);

const group = new THREE.Group();
group.add(character.model);
const box = new THREE.Box3().setFromObject(character.model);
character.model.position.y -= box.min.y; // correct once, relative to the group
this.scene.add(group);
    gameAssets.playAction(character, "Idle_Gun", 0.1);

    this.remotePlayers.set(id, {
      character,
      targetPos: character.model.position.clone(),
      weaponModel,
      muzzleFlash,
      currentWeaponKey: weaponKey,
      lastAmmo: Infinity,
      lastHealth: 100,
      moving: false,
    });
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
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(ARENA_HALF_SIZE * 2, ARENA_HALF_SIZE * 2),
      new THREE.MeshStandardMaterial({ color: 0x111827 }),
    );
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);
    this.scene.add(
      new THREE.GridHelper(ARENA_HALF_SIZE * 2, 30, 0x22d3ee, 0x1e293b),
    );

    const wallMat = new THREE.MeshStandardMaterial({ color: 0x0f172a });
    const wallHeight = 5;
    const wallThickness = 0.5;
    const positions: [number, number, number, number, number][] = [
      [0, wallHeight / 2, -ARENA_HALF_SIZE, ARENA_HALF_SIZE * 2, wallThickness],
      [0, wallHeight / 2, ARENA_HALF_SIZE, ARENA_HALF_SIZE * 2, wallThickness],
      [-ARENA_HALF_SIZE, wallHeight / 2, 0, wallThickness, ARENA_HALF_SIZE * 2],
      [ARENA_HALF_SIZE, wallHeight / 2, 0, wallThickness, ARENA_HALF_SIZE * 2],
    ];
    for (const [x, y, z, w, d] of positions) {
      const wall = new THREE.Mesh(
        new THREE.BoxGeometry(w, wallHeight, d),
        wallMat,
      );
      wall.position.set(x, y, z);
      this.scene.add(wall);
    }

    // const coverMat = new THREE.MeshStandardMaterial({ color: 0x1e293b });
    // const coverPositions: [number, number][] = [
    //   [4, 4],
    //   [-5, -3],
    //   [6, -6],
    //   [-6, 5],
    //   [0, -8],
    // ];
    // for (const [x, z] of coverPositions) {
    //   const box = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2, 1.6), coverMat);
    //   box.position.set(x, 1, z);
    //   this.scene.add(box);
    // }
  }

  private setupLights() {
    this.scene.add(new THREE.AmbientLight(0x8899aa, 0.65));
    const point = new THREE.PointLight(0x22d3ee, 1.4, 60);
    point.position.set(0, 8, 0);
    this.scene.add(point);
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
  }

  private switchToSlot(slot: number) {
    if (slot === this.currentSlot || this.state.isDead || slot < 0 || slot > 2)
      return;
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

    const muzzleWorld = new THREE.Vector3();
    this.muzzleFlash.getWorldPosition(muzzleWorld);
    const farPoint = muzzleWorld
      .clone()
      .add(direction.clone().multiplyScalar(40));
    const tracer = spawnTracer(this.scene, muzzleWorld, farPoint);
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
    if (this.state.isDead) return;
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

    if (this.velocity.lengthSq() > 0) {
      this.velocity.normalize().multiplyScalar(PLAYER_SPEED * delta);
      const next = this.camera.position.clone().add(this.velocity);
      const bound = ARENA_HALF_SIZE - 0.6;
      next.x = Math.max(-bound, Math.min(bound, next.x));
      next.z = Math.max(-bound, Math.min(bound, next.z));
      this.camera.position.x = next.x;
      this.camera.position.z = next.z;
    }

    this.verticalVelocity += GRAVITY * delta;
    this.camera.position.y += this.verticalVelocity * delta;
    if (this.camera.position.y <= PLAYER_HEIGHT) {
      this.camera.position.y = PLAYER_HEIGHT;
      this.verticalVelocity = 0;
      this.isGrounded = true;
    }
  }

  private sendMovementIfDue() {
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

  private interpolateOpponent(delta: number) {
    if (!this.opponentMesh) return;
    this.opponentMesh.position.lerp(
      this.opponentTargetPos,
      Math.min(1, delta * 10),
    );
  }

  private interpolateRemotePlayers(delta: number) {
    for (const remote of this.remotePlayers.values()) {
      const before = remote.character.model.position.clone();
      remote.character.model.position.lerp(
        remote.targetPos,
        Math.min(1, delta * 10),
      );
      const moved = remote.character.model.position.distanceTo(before) > 0.001;
      if (moved !== remote.moving) {
        remote.moving = moved;
        gameAssets.playAction(
          remote.character,
          moved ? "Run_Gun" : "Idle_Gun",
          0.2,
        );
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
    this.renderer.dispose();
  }
}
