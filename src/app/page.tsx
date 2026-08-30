import Link from "next/link";
import CreateRoomButton from "@/app/components/CreateRoomButton";
import JoinRoomForm from "@/app/components/JoinRoomForm";
import Navbar from "@/app/components/Navbar";
import { getCurrentUser } from "@/lib/auth";

export default async function Home() {
  const user = await getCurrentUser();

  return (
    <div className="min-h-screen bg-black flex flex-col">
      <Navbar />
      <main className="flex-1 flex flex-col items-center justify-center px-6">
        <div className="text-center max-w-2xl">
          <p className="text-[#8a8a90] tracking-[0.3em] text-sm mb-4 font-mono">
            BROWSER ARENA SHOOTER
          </p>
          <h1 className="text-6xl font-black italic mb-6 text-white">
            ARENA
          </h1>
          <p className="text-[#8a8a90] mb-4">
            Fast 1v1 duels. Sharpen your aim. Climb the leaderboard.
          </p>

          <p className="text-[#7a7a82] text-sm mb-8 font-mono">
            {user ? (
              <>
                Signed in as{" "}
                <span className="text-white">{user.username}</span>
              </>
            ) : (
              <Link href="/login" className="text-white hover:underline">
                Log in
              </Link>
            )}
          </p>

          <div className="flex flex-col sm:flex-row flex-wrap gap-3 justify-center mb-16">
            <Link href="/practice" className="xa-btn-primary px-8 py-3 text-sm">
              PRACTICE
            </Link>
            <Link href="/arena" className="xa-btn-primary px-8 py-3 text-sm">
              PLAY NOW
            </Link>
            <Link href="/leaderboard" className="xa-btn-secondary px-8 py-3 text-sm">
              LEADERBOARD
            </Link>
            <Link href="/queue" className="xa-btn-secondary px-8 py-3 text-sm">
              1V1 (BETA)
            </Link>
            <CreateRoomButton />
            <Link href="/loadout" className="xa-btn-secondary px-8 py-3 text-sm">
              LOADOUT
            </Link>
            <Link href="/settings" className="xa-btn-secondary px-8 py-3 text-sm">
              SETTINGS
            </Link>
          </div>

          <div className="grid grid-cols-3 gap-4 text-sm text-[#8a8a90] font-mono">
            <div className="xa-panel py-3">
              <div className="text-white text-xl font-bold">0</div>
              PLAYERS ONLINE
            </div>
            <div className="xa-panel py-3">
              <div className="text-white text-xl font-bold">1v1</div>
              CORE MODE
            </div>
            <div className="xa-panel py-3">
              <div className="text-white text-xl font-bold">FPS</div>
              ARENA STYLE
            </div>
          </div>

          <JoinRoomForm />
        </div>
      </main>
    </div>
  );
}