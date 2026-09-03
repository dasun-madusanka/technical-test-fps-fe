import * as THREE from "three";

export type SoundName =
  | "fire_rifle" | "fire_pistol" | "fire_knife"
  | "reload_rifle" | "reload_pistol" | "reload_knife"
  | "dry_fire" | "weapon_switch"
  | "footstep_run"
  | "jump" | "land"
  | "hit_taken" | "hit_landed" | "kill_confirm"
  | "death" | "respawn"
  | "match_win" | "match_lose";

// Map every sound name to a file the game should ship under /public/sounds/.
// Swap these for your own assets (e.g. kenney.nl/assets, freesound.org, mixkit.co).
const MANIFEST: Record<SoundName, string> = {
  fire_rifle: "/sounds/weapons/rifle_fire.mp3",
  fire_pistol: "/sounds/weapons/pistol_fire.mp3",
  fire_knife: "/sounds/weapons/knife_swing.mp3",
  reload_rifle: "/sounds/weapons/rifle_reload.mp3",
  reload_pistol: "/sounds/weapons/pistol_reload.mp3",
  reload_knife: "/sounds/weapons/knife_reload.mp3",
  dry_fire: "/sounds/weapons/dry_fire.mp3",
  weapon_switch: "/sounds/weapons/weapon_switch.mp3",
  footstep_run: "/sounds/player/footsteps_run.mp3",
  jump: "/sounds/player/jump.mp3",
  land: "/sounds/player/land.mp3",
  hit_taken: "/sounds/player/hit_taken.mp3",
  hit_landed: "/sounds/player/hit_confirm.mp3",
  kill_confirm: "/sounds/player/kill_confirm.mp3",
  death: "/sounds/player/death.mp3",
  respawn: "/sounds/player/respawn.mp3",
  match_win: "/sounds/ui/match_win.mp3",
  match_lose: "/sounds/ui/match_lose.mp3",
};

// weapon key ("rifle" | "pistol" | "knife") -> action -> sound name, with a safe fallback.
export function weaponSound(weaponKey: string, action: "fire" | "reload"): SoundName {
  const key = `${action}_${weaponKey}` as SoundName;
  return MANIFEST[key] ? key : (action === "fire" ? "fire_rifle" : "reload_rifle");
}

class SoundManagerImpl {
  private listener: THREE.AudioListener | null = null;
  private buffers = new Map<SoundName, AudioBuffer>();
  private loader = new THREE.AudioLoader();
  private masterVolume = 0.8;

  /** Call once per game instance, right after the camera is created. */
  attachListener(camera: THREE.Camera) {
    if (this.listener) camera.remove(this.listener);
    this.listener = new THREE.AudioListener();
    camera.add(this.listener);
  }

  setMasterVolume(v: number) {
    this.masterVolume = THREE.MathUtils.clamp(v, 0, 1);
  }

  /** Preloads everything up front so first-use doesn't stutter. Missing files are skipped, not fatal. */
  async preloadAll() {
    const entries = Object.entries(MANIFEST) as [SoundName, string][];
    await Promise.all(
      entries.map(
        ([name, url]) =>
          new Promise<void>((resolve) => {
            if (this.buffers.has(name)) return resolve();
            this.loader.load(
              url,
              (buffer) => {
                this.buffers.set(name, buffer);
                resolve();
              },
              undefined,
              () => {
                console.warn(`[sound] missing or failed to load: ${url}`);
                resolve(); // never block the game on a missing sfx file
              },
            );
          }),
      ),
    );
  }

  /** Non-positional one-shot — for the local player's own actions. */
  play2D(name: SoundName, volume = 1) {
    if (!this.listener) return;
    const buffer = this.buffers.get(name);
    if (!buffer) return;
    const audio = new THREE.Audio(this.listener);
    audio.setBuffer(buffer);
    audio.setVolume(volume * this.masterVolume);
    audio.play();
    audio.onEnded = () => audio.disconnect();
  }

  /** Positional one-shot attached to a moving object — bot / remote player gunfire, hit reacts, death, jump, land. */
  playAt(name: SoundName, target: THREE.Object3D, volume = 1, refDistance = 6) {
    if (!this.listener) return;
    const buffer = this.buffers.get(name);
    if (!buffer) return;
    const audio = new THREE.PositionalAudio(this.listener);
    audio.setBuffer(buffer);
    audio.setRefDistance(refDistance);
    audio.setVolume(volume * this.masterVolume);
    target.add(audio);
    audio.play();
    audio.onEnded = () => {
      target.remove(audio);
      audio.disconnect();
    };
  }

  // ---- looping footsteps, keyed per-owner so start/stop is idempotent ----
  private loops = new Map<string, THREE.Audio | THREE.PositionalAudio>();

  loopAt(key: string, name: SoundName, target: THREE.Object3D | null, volume = 0.6) {
    if (this.loops.has(key) || !this.listener) return;
    const buffer = this.buffers.get(name);
    if (!buffer) return;
    const audio = target
      ? new THREE.PositionalAudio(this.listener)
      : new THREE.Audio(this.listener);
    audio.setBuffer(buffer);
    audio.setLoop(true);
    audio.setVolume(volume * this.masterVolume);
    if (audio instanceof THREE.PositionalAudio) audio.setRefDistance(5);
    (target ?? this.listener).add(audio);
    audio.play();
    this.loops.set(key, audio);
  }

  stopLoop(key: string) {
    const audio = this.loops.get(key);
    if (!audio) return;
    audio.stop();
    audio.parent?.remove(audio);
    audio.disconnect();
    this.loops.delete(key);
  }

  stopAllLoops() {
    for (const key of [...this.loops.keys()]) this.stopLoop(key);
  }
}

export const soundManager = new SoundManagerImpl();