import * as THREE from "three";

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

interface Target {
  mesh: THREE.Mesh;
  spawnTime: number;
}

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

export class ArenaGame {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private raycaster = new THREE.Raycaster();
  private clock = new THREE.Clock();
  private animationId = 0;
  private canvas: HTMLCanvasElement;
  private running = false;

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

  private get weapon(): WeaponConfig {
    return this.inventory[this.currentSlot];
  }

  // bot
  private botMesh: THREE.Mesh;
  private botHealth = BOT_HEALTH_MAX;
  private botLastShotTime = 0;
  private botTarget = new THREE.Vector3();
  private botAlive = true;
  private botRetargetTimer = 0;

  private obstacles: THREE.Mesh[] = [];

  private state: ArenaState;
  private onState: StateListener;

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
    this.resetPlayerPosition();

    this.buildArena();
    this.setupLights();
    this.botMesh = this.spawnBot();

    window.addEventListener("resize", this.handleResize);
    canvas.addEventListener("mousedown", this.handleMouseDown);
    document.addEventListener("mousemove", this.handleMouseMove);
    document.addEventListener("keydown", this.handleKeyDown);
    document.addEventListener("keyup", this.handleKeyUp);

    this.emitState();
  }

  private resetPlayerPosition() {
    this.camera.position.set(0, PLAYER_HEIGHT, 10);
    this.yaw = Math.PI;
    this.pitch = 0;
    this.verticalVelocity = 0;
    this.isGrounded = true;
    this.camera.quaternion.setFromEuler(new THREE.Euler(0, this.yaw, 0, "YXZ"));
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
      this.obstacles.push(box);
    }
  }

  private setupLights() {
    this.scene.add(new THREE.AmbientLight(0x8899aa, 0.65));
    const point = new THREE.PointLight(0x22d3ee, 1.4, 60);
    point.position.set(0, 8, 0);
    this.scene.add(point);
  }

  private spawnBot(): THREE.Mesh {
    const bot = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.5, 1.2, 4, 8),
      new THREE.MeshStandardMaterial({ color: 0xf97316, emissive: 0x7c2d12 }),
    );
    bot.position.set(0, 1.1, -10);
    this.scene.add(bot);
    this.botHealth = BOT_HEALTH_MAX;
    this.botAlive = true;
    this.botTarget.copy(bot.position);
    return bot;
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

  // ---------- weapon ----------

  private switchToSlot(slot: number) {
    if (
      slot === this.currentSlot ||
      this.state.isPlayerDead ||
      slot < 0 ||
      slot > 2
    )
      return;
    this.lastSlot = this.currentSlot;
    this.currentSlot = slot;
    this.reloading = false;
    this.state.isReloading = false;
    this.state.playerAmmo = this.ammoPerWeapon[slot];
    this.state.magazineSize = this.inventory[slot].magazineSize;
    this.state.currentWeaponName = this.inventory[slot].name;
    this.state.currentWeaponSlot = slot;
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
      this.reload();
      return;
    }

    this.lastShotTime = now;
    this.state.playerAmmo -= 1;
    this.ammoPerWeapon[this.currentSlot] = this.state.playerAmmo;

    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    const targets = this.botAlive
      ? [this.botMesh, ...this.obstacles]
      : this.obstacles;
    const hits = this.raycaster.intersectObjects(targets, false);

    if (hits.length > 0 && hits[0].object === this.botMesh) {
      this.damageBot(this.weapon.damage);
    }

    this.emitState();
  }

  private reload() {
    if (this.reloading || this.state.playerAmmo === this.weapon.magazineSize)
      return;
    this.reloading = true;
    this.state.isReloading = true;
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
    if (!this.botAlive || this.state.matchOver) return;
    this.botHealth -= amount;
    if (this.botHealth <= 0) {
      this.botAlive = false;
      this.scene.remove(this.botMesh);
      this.state.playerKills += 1;
      this.weaponKills[this.currentSlot] += 1;
      this.pushKillFeed("You eliminated the bot");

      if (this.state.playerKills >= SCORE_LIMIT) {
        this.endMatch(true);
        return;
      }
      setTimeout(() => this.respawnBot(), 2000);
    }
  }

  private respawnBot() {
    this.botMesh = this.spawnBot();
  }

  private damagePlayer(amount: number) {
    if (this.state.isPlayerDead || this.state.matchOver) return;
    this.state.playerHealth -= amount;
    if (this.state.playerHealth <= 0) {
      this.state.playerHealth = 0;
      this.state.isPlayerDead = true;
      this.state.playerDeaths += 1;
      this.state.botKills += 1;
      this.pushKillFeed("The bot eliminated you");

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

    if (this.camera.position.y <= GROUND_Y) {
      this.camera.position.y = GROUND_Y;
      this.verticalVelocity = 0;
      this.isGrounded = true;
    }
  }

  // ---------- bot AI ----------

  private updateBot(delta: number) {
    if (!this.botAlive) return;

    this.botRetargetTimer -= delta;
    if (this.botRetargetTimer <= 0) {
      this.botRetargetTimer = 1.5 + Math.random() * 1.5;
      const angle = Math.random() * Math.PI * 2;
      const radius = 3 + Math.random() * 6;
      this.botTarget.set(
        Math.cos(angle) * radius,
        1.1,
        Math.sin(angle) * radius,
      );
    }

    const toTarget = this.botTarget.clone().sub(this.botMesh.position);
    toTarget.y = 0;
    if (toTarget.lengthSq() > 0.1) {
      toTarget.normalize().multiplyScalar(2.2 * delta);
      this.botMesh.position.add(toTarget);
    }
    this.botMesh.lookAt(
      this.camera.position.x,
      this.botMesh.position.y,
      this.camera.position.z,
    );

    const now = performance.now();
    if (now - this.botLastShotTime > BOT_FIRE_INTERVAL_MS) {
      this.botLastShotTime = now;

      if (this.hasLineOfSightToPlayer()) {
        const distance = this.botMesh.position.distanceTo(this.camera.position);
        const hitChance = Math.max(0.15, 0.75 - distance * 0.03);
        if (Math.random() < hitChance) {
          this.damagePlayer(BOT_DAMAGE);
        }
      }
    }
  }

  private hasLineOfSightToPlayer(): boolean {
    const origin = this.botMesh.position.clone();
    origin.y = 1.1;
    const target = this.camera.position.clone();
    const direction = target.clone().sub(origin);
    const distance = direction.length();
    direction.normalize();

    this.raycaster.set(origin, direction);
    this.raycaster.far = distance;
    const blocked = this.raycaster.intersectObjects(this.obstacles, false);
    return blocked.length === 0;
  }

  // ---------- loop ----------

  start() {
    this.running = true;
    this.loop();
  }

  private loop = () => {
    if (!this.running) return;
    this.animationId = requestAnimationFrame(this.loop);
    const delta = Math.min(this.clock.getDelta(), 0.1);

    this.updatePlayerMovement(delta);
    this.updateBot(delta);

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
    this.renderer.dispose();
  }
}
