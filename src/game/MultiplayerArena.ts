import * as THREE from "three";
import { io, Socket } from "socket.io-client";

export interface MultiplayerState {
  connectionStatus: "connecting" | "queued" | "matched" | "disconnected" | "error";
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
}

type StateListener = (state: MultiplayerState) => void;

const GAME_SERVER_URL = process.env.NEXT_PUBLIC_GAME_SERVER_URL || "http://localhost:4000";
const ARENA_HALF_SIZE = 15;
const PLAYER_SPEED = 5.5;
const PLAYER_HEIGHT = 1.6;
const GRAVITY = -18;
const JUMP_SPEED = 6.5;
const MAGAZINE_SIZE = 30;
const RELOAD_TIME_MS = 1500;
const FIRE_INTERVAL_MS = 180;
const MOVE_SEND_INTERVAL_MS = 50;

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

  private opponentMesh: THREE.Mesh | null = null;
  private opponentTargetPos = new THREE.Vector3();

  private state: MultiplayerState = {
    connectionStatus: "connecting",
    myHealth: 100,
    myAmmo: MAGAZINE_SIZE,
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
  };
  private onState: StateListener;
  private myUserId: string | null = null;

  constructor(canvas: HTMLCanvasElement, token: string, onState: StateListener) {
    this.canvas = canvas;
    this.onState = onState;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x05060a);
    this.scene.fog = new THREE.Fog(0x05060a, 20, 55);

    this.camera = new THREE.PerspectiveCamera(78, canvas.clientWidth / canvas.clientHeight, 0.1, 1000);
    this.camera.position.set(0, PLAYER_HEIGHT, 10);

    this.buildArena();
    this.setupLights();

    window.addEventListener("resize", this.handleResize);
    canvas.addEventListener("mousedown", this.handleMouseDown);
    document.addEventListener("mousemove", this.handleMouseMove);
    document.addEventListener("keydown", this.handleKeyDown);
    document.addEventListener("keyup", this.handleKeyUp);

    this.socket = io(GAME_SERVER_URL, { auth: { token }, transports: ["websocket"] });
    this.registerSocketHandlers();
  }

  setMyUserId(userId: string) {
    this.myUserId = userId;
  }

  private registerSocketHandlers() {
    this.socket.on("connect", () => {
      this.updateState({ connectionStatus: "queued" });
      this.socket.emit("queue:join");
    });

    this.socket.on("connect_error", () => this.updateState({ connectionStatus: "error" }));
    this.socket.on("queue:waiting", () => this.updateState({ connectionStatus: "queued" }));

    this.socket.on("match:found", () => {
      this.updateState({ connectionStatus: "matched" });
      this.start();
    });

    this.socket.on(
      "state:update",
      (data: {
        players: {
          id: string; username: string; x: number; y: number; z: number; yaw: number;
          health: number; ammo: number; kills: number; deaths: number; alive: boolean;
        }[];
      }) => this.applyStateUpdate(data.players)
    );

    this.socket.on("player:damaged", (data: { targetId: string; health: number }) => {
      if (data.targetId === this.myUserId) this.updateState({ myHealth: data.health });
      else this.updateState({ opponentHealth: data.health });
    });

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
      }
    );

    this.socket.on(
      "player:respawned",
      (data: { userId: string; x: number; y: number; z: number }) => {
        if (data.userId === this.myUserId) {
          this.camera.position.set(data.x, data.y, data.z);
          this.updateState({ isDead: false, myHealth: 100, myAmmo: MAGAZINE_SIZE });
        } else if (this.opponentMesh) {
          this.opponentMesh.position.set(data.x, data.y, data.z);
          this.opponentTargetPos.set(data.x, data.y, data.z);
        }
      }
    );

    this.socket.on(
      "match:end",
      (data: { winnerId: string; results: { userId: string; kills: number; deaths: number; won: boolean }[] }) => {
        const me = data.results.find((r) => r.userId === this.myUserId);
        this.running = false;
        this.updateState({
          matchOver: true,
          won: !!me?.won,
          myKills: me?.kills ?? this.state.myKills,
          myDeaths: me?.deaths ?? this.state.myDeaths,
        });
      }
    );

    this.socket.on("disconnect", () => this.updateState({ connectionStatus: "disconnected" }));
  }

  private applyStateUpdate(
    players: {
      id: string; username: string; x: number; y: number; z: number; yaw: number;
      health: number; ammo: number; kills: number; deaths: number; alive: boolean;
    }[]
  ) {
    for (const p of players) {
      if (p.id === this.myUserId) {
        this.updateState({ myHealth: p.health, myAmmo: p.ammo, myKills: p.kills, myDeaths: p.deaths });
        continue;
      }
      if (!this.opponentMesh) {
        this.opponentMesh = new THREE.Mesh(
          new THREE.CapsuleGeometry(0.5, 1.2, 4, 8),
          new THREE.MeshStandardMaterial({ color: 0xf97316, emissive: 0x7c2d12 })
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
      new THREE.MeshStandardMaterial({ color: 0x111827 })
    );
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);
    this.scene.add(new THREE.GridHelper(ARENA_HALF_SIZE * 2, 30, 0x22d3ee, 0x1e293b));

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
      const wall = new THREE.Mesh(new THREE.BoxGeometry(w, wallHeight, d), wallMat);
      wall.position.set(x, y, z);
      this.scene.add(wall);
    }

    const coverMat = new THREE.MeshStandardMaterial({ color: 0x1e293b });
    const coverPositions: [number, number][] = [[4, 4], [-5, -3], [6, -6], [-6, 5], [0, -8]];
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
    if (e.code === "KeyR") this.reload();
    if (e.code === "Space") this.jump();
  };
  private handleKeyUp = (e: KeyboardEvent) => { this.keys[e.code] = false; };

  private jump() {
    if (!this.isGrounded || this.state.isDead) return;
    this.verticalVelocity = JUMP_SPEED;
    this.isGrounded = false;
  }

  private handleMouseMove = (e: MouseEvent) => {
    if (document.pointerLockElement !== this.canvas) return;
    const sensitivity = 0.0022;
    this.yaw -= e.movementX * sensitivity;
    this.pitch -= e.movementY * sensitivity;
    this.pitch = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, this.pitch));
    this.camera.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, "YXZ"));
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
    if (now - this.lastShotTime < FIRE_INTERVAL_MS) return;
    if (this.state.myAmmo <= 0) { this.reload(); return; }
    this.lastShotTime = now;

    const direction = new THREE.Vector3();
    this.camera.getWorldDirection(direction);

    this.socket.emit("player:shoot", {
      origin: { x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z },
      direction: { x: direction.x, y: direction.y, z: direction.z },
    });

    // optimistic local ammo feedback only — server is authoritative and corrects via state:update
    this.updateState({ myAmmo: Math.max(0, this.state.myAmmo - 1) });
  }

  private reload() {
    if (this.reloading || this.state.myAmmo === MAGAZINE_SIZE) return;
    this.reloading = true;
    this.updateState({ isReloading: true });
    this.socket.emit("player:reload");
    setTimeout(() => {
      this.reloading = false;
      this.updateState({ isReloading: false, myAmmo: MAGAZINE_SIZE });
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
    this.updateState({ killFeed: [message, ...this.state.killFeed].slice(0, 4) });
  }

  private updateState(partial: Partial<MultiplayerState>) {
    this.state = { ...this.state, ...partial };
    this.onState({ ...this.state, killFeed: [...this.state.killFeed] });
  }

  private updatePlayerMovement(delta: number) {
    if (this.state.isDead) return;
    const forward = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)).negate();
    const right = new THREE.Vector3(Math.sin(this.yaw + Math.PI / 2), 0, Math.cos(this.yaw + Math.PI / 2)).negate();

    this.velocity.set(0, 0, 0);
    if (this.keys["KeyW"]) this.velocity.add(forward);
    if (this.keys["KeyS"]) this.velocity.sub(forward);
    if (this.keys["KeyD"]) this.velocity.add(right);
    if (this.keys["KeyA"]) this.velocity.sub(right);

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
    this.opponentMesh.position.lerp(this.opponentTargetPos, Math.min(1, delta * 10));
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
    this.socket.emit("queue:leave");
    this.socket.disconnect();
    this.renderer.dispose();
  }
}