import * as THREE from "three";
import { Socket } from "socket.io-client";
import {
  GameSettings,
  WeaponConfig,
  WeaponInventory,
  DEFAULT_SETTINGS,
} from "./ArenaGame";

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

  private get weapon(): WeaponConfig {
    return this.inventory[this.currentSlot];
  }

  private opponentMesh: THREE.Mesh | null = null;
  private opponentTargetPos = new THREE.Vector3();

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

    this.buildArena();
    this.setupLights();

    window.addEventListener("resize", this.handleResize);
    canvas.addEventListener("mousedown", this.handleMouseDown);
    document.addEventListener("mousemove", this.handleMouseMove);
    document.addEventListener("keydown", this.handleKeyDown);
    document.addEventListener("keyup", this.handleKeyUp);

    this.registerSocketHandlers(roomCode);
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
        } else if (this.opponentMesh) {
          this.opponentMesh.position.set(data.x, data.y, data.z);
          this.opponentTargetPos.set(data.x, data.y, data.z);
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
      if (!this.opponentMesh) {
        this.opponentMesh = new THREE.Mesh(
          new THREE.CapsuleGeometry(0.5, 1.2, 4, 8),
          new THREE.MeshStandardMaterial({
            color: 0xf97316,
            emissive: 0x7c2d12,
          }),
        );
        this.scene.add(this.opponentMesh);
        this.updateState({ opponentUsername: p.username });
      }
      this.opponentTargetPos.set(p.x, p.y, p.z);
      this.opponentMesh.rotation.y = p.yaw;
      this.updateState({ opponentKills: p.kills });
    }
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

    const coverMat = new THREE.MeshStandardMaterial({ color: 0x1e293b });
    const coverPositions: [number, number][] = [
      [4, 4],
      [-5, -3],
      [6, -6],
      [-6, 5],
      [0, -8],
    ];
    for (const [x, z] of coverPositions) {
      const box = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2, 1.6), coverMat);
      box.position.set(x, 1, z);
      this.scene.add(box);
    }
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

  start() {
    this.running = true;
    this.loop();
  }

  private loop = () => {
    if (!this.running) return;
    this.animationId = requestAnimationFrame(this.loop);
    const delta = Math.min(this.clock.getDelta(), 0.1);

    this.updatePlayerMovement(delta);
    this.sendMovementIfDue();
    this.interpolateOpponent(delta);

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
