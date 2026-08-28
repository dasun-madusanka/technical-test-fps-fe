import * as THREE from "three";

export interface AimStats {
  shots: number;
  hits: number;
  misses: number;
  accuracy: number;
  targetsDestroyed: number;
  score: number;
  avgReactionMs: number;
}

type StatsListener = (stats: AimStats) => void;

interface Target {
  mesh: THREE.Mesh;
  spawnTime: number;
  velocity: THREE.Vector3;
  isMoving: boolean;
}

const ARENA_HALF_SIZE = 12;

export class AimTrainer {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private raycaster = new THREE.Raycaster();
  private targets: Target[] = [];
  private clock = new THREE.Clock();
  private animationId = 0;

  private yaw = 0;
  private pitch = 0;

  private stats: AimStats = {
    shots: 0,
    hits: 0,
    misses: 0,
    accuracy: 0,
    targetsDestroyed: 0,
    score: 0,
    avgReactionMs: 0,
  };
  private reactionTimes: number[] = [];

  private onStats: StatsListener;
  private canvas: HTMLCanvasElement;
  private running = false;

  constructor(canvas: HTMLCanvasElement, onStats: StatsListener) {
    this.canvas = canvas;
    this.onStats = onStats;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x05060a);
    this.scene.fog = new THREE.Fog(0x05060a, 15, 40);

    this.camera = new THREE.PerspectiveCamera(
      75,
      canvas.clientWidth / canvas.clientHeight,
      0.1,
      1000
    );
    this.camera.position.set(0, 1.6, 0);

    this.buildArena();
    this.setupLights();

    window.addEventListener("resize", this.handleResize);
    canvas.addEventListener("mousedown", this.handleShoot);
    document.addEventListener("mousemove", this.handleMouseMove);
    document.addEventListener("pointerlockchange", this.handlePointerLockChange);
  }

  private buildArena() {
    const floorGeo = new THREE.PlaneGeometry(ARENA_HALF_SIZE * 2, ARENA_HALF_SIZE * 2);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x111827 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);

    const grid = new THREE.GridHelper(ARENA_HALF_SIZE * 2, 24, 0x22d3ee, 0x1e293b);
    this.scene.add(grid);

    const backWallGeo = new THREE.PlaneGeometry(ARENA_HALF_SIZE * 2, 6);
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x0f172a });
    const backWall = new THREE.Mesh(backWallGeo, wallMat);
    backWall.position.set(0, 3, -ARENA_HALF_SIZE);
    this.scene.add(backWall);
  }

  private setupLights() {
    const ambient = new THREE.AmbientLight(0x8899aa, 0.6);
    this.scene.add(ambient);
    const point = new THREE.PointLight(0x22d3ee, 1.2, 50);
    point.position.set(0, 6, 2);
    this.scene.add(point);
  }

  private spawnTarget(moving: boolean) {
    const geometry = new THREE.SphereGeometry(0.4, 16, 16);
    const material = new THREE.MeshStandardMaterial({
      color: moving ? 0xf97316 : 0xef4444,
      emissive: moving ? 0x7c2d12 : 0x7f1d1d,
    });
    const mesh = new THREE.Mesh(geometry, material);

    const x = (Math.random() - 0.5) * (ARENA_HALF_SIZE * 1.6);
    const y = 1 + Math.random() * 2.5;
    const z = -ARENA_HALF_SIZE + 1 + Math.random() * 4;
    mesh.position.set(x, y, z);

    this.scene.add(mesh);

    const velocity = moving
      ? new THREE.Vector3((Math.random() - 0.5) * 2, 0, 0)
      : new THREE.Vector3(0, 0, 0);

    this.targets.push({
      mesh,
      spawnTime: performance.now(),
      velocity,
      isMoving: moving,
    });
  }

  private handleResize = () => {
    const { clientWidth, clientHeight } = this.canvas;
    this.camera.aspect = clientWidth / clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(clientWidth, clientHeight);
  };

  private handleMouseMove = (e: MouseEvent) => {
    if (document.pointerLockElement !== this.canvas) return;
    const sensitivity = 0.0022;
    this.yaw -= e.movementX * sensitivity;
    this.pitch -= e.movementY * sensitivity;
    this.pitch = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, this.pitch));

    this.camera.quaternion.setFromEuler(
      new THREE.Euler(this.pitch, this.yaw, 0, "YXZ")
    );
  };

  private handlePointerLockChange = () => {
    // no-op hook available for future pause-on-unlock behavior
  };

  private handleShoot = () => {
    if (document.pointerLockElement !== this.canvas) {
      this.canvas.requestPointerLock();
      return;
    }

    this.stats.shots += 1;

    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    const meshes = this.targets.map((t) => t.mesh);
    const intersects = this.raycaster.intersectObjects(meshes, false);

    if (intersects.length > 0) {
      const hitMesh = intersects[0].object as THREE.Mesh;
      const targetIndex = this.targets.findIndex((t) => t.mesh === hitMesh);
      if (targetIndex !== -1) {
        const target = this.targets[targetIndex];
        const reactionMs = performance.now() - target.spawnTime;
        this.reactionTimes.push(reactionMs);

        this.stats.hits += 1;
        this.stats.targetsDestroyed += 1;
        this.stats.score += target.isMoving ? 150 : 100;

        this.scene.remove(target.mesh);
        target.mesh.geometry.dispose();
        (target.mesh.material as THREE.Material).dispose();
        this.targets.splice(targetIndex, 1);

        this.spawnTarget(Math.random() > 0.5);
      }
    } else {
      this.stats.misses += 1;
    }

    this.stats.accuracy =
      this.stats.shots > 0 ? (this.stats.hits / this.stats.shots) * 100 : 0;
    this.stats.avgReactionMs =
      this.reactionTimes.length > 0
        ? this.reactionTimes.reduce((a, b) => a + b, 0) / this.reactionTimes.length
        : 0;

    this.onStats({ ...this.stats });
  };

  start() {
    this.running = true;
    for (let i = 0; i < 5; i++) {
      this.spawnTarget(i % 2 === 0);
    }
    this.loop();
  }

  private loop = () => {
    if (!this.running) return;
    this.animationId = requestAnimationFrame(this.loop);

    const delta = this.clock.getDelta();

    for (const target of this.targets) {
      if (target.isMoving) {
        target.mesh.position.addScaledVector(target.velocity, delta);
        if (Math.abs(target.mesh.position.x) > ARENA_HALF_SIZE * 0.8) {
          target.velocity.x *= -1;
        }
      }
    }

    this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    this.running = false;
    cancelAnimationFrame(this.animationId);
    window.removeEventListener("resize", this.handleResize);
    this.canvas.removeEventListener("mousedown", this.handleShoot);
    document.removeEventListener("mousemove", this.handleMouseMove);
    document.removeEventListener("pointerlockchange", this.handlePointerLockChange);

    for (const target of this.targets) {
      target.mesh.geometry.dispose();
      (target.mesh.material as THREE.Material).dispose();
    }
    this.renderer.dispose();
  }
}