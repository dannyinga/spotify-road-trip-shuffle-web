"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { User } from "@supabase/supabase-js";

export default function Home() {
  const supabase = createClient();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Monitor auth state changes reactively
  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user ?? null);
      setLoading(false);
    };

    checkSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase.auth]);

  // Fetch Spotify profile using React Query
  const { data: profile, isLoading: isProfileLoading } = useQuery({
    queryKey: ["spotify-profile", user?.id],
    queryFn: async () => {
      const response = await fetch("/api/spotify/me");
      if (!response.ok) {
        throw new Error("Failed to fetch Spotify profile");
      }
      const data = await response.json();
      return data.profile;
    },
    enabled: !!user,
  });

  const handleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "spotify",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        scopes: "playlist-read-private playlist-read-collaborative playlist-modify-public playlist-modify-private user-read-private user-read-email",
      },
    });
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 text-white font-sans">
        <div className="relative flex items-center justify-center">
          <div className="h-16 w-16 animate-spin rounded-full border-t-2 border-r-2 border-emerald-500"></div>
          <span className="absolute text-zinc-500 text-xs font-semibold tracking-wider uppercase">Loading</span>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen flex-col justify-between overflow-hidden bg-zinc-950 text-zinc-100 font-sans selection:bg-emerald-500 selection:text-black">
      {/* Background ambient lighting */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_var(--tw-gradient-stops))] from-emerald-500/10 via-transparent to-transparent opacity-70"></div>
      <div className="pointer-events-none absolute -left-40 top-1/4 h-[500px] w-[500px] rounded-full bg-emerald-500/5 blur-[120px]"></div>
      <div className="pointer-events-none absolute -right-40 bottom-1/4 h-[500px] w-[500px] rounded-full bg-emerald-500/5 blur-[120px]"></div>

      {/* Header */}
      <header className="z-10 flex items-center justify-between px-6 py-5 border-b border-zinc-900 bg-zinc-950/60 backdrop-blur-md md:px-12">
        <div className="flex items-center gap-3">
          <div className="group relative flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/10 border border-emerald-500/20">
            <svg
              className="h-5 w-5 text-emerald-400 transition-transform duration-700 group-hover:rotate-180"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <circle cx="12" cy="12" r="10" strokeWidth="2" />
              <circle cx="12" cy="12" r="3" strokeWidth="2" />
            </svg>
          </div>
          <span className="text-xl font-bold tracking-tight bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
            Road Trip Shuffle
          </span>
        </div>

        {user && (
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/60 px-4 py-2 text-sm font-semibold text-zinc-400 transition-all hover:border-zinc-700 hover:text-white hover:bg-zinc-900"
          >
            Sign Out
          </button>
        )}
      </header>

      {/* Main Content */}
      <main className="z-10 flex flex-1 flex-col items-center justify-center px-6 py-12 md:px-12">
        {!user ? (
          /* LANDING STATE */
          <div className="flex max-w-4xl flex-col items-center text-center">
            {/* Spinning CD Graphic */}
            <div className="group relative mb-8 flex h-36 w-36 items-center justify-center rounded-full bg-zinc-900 shadow-2xl border-4 border-zinc-800">
              {/* Outer Vinyl grooves */}
              <div className="absolute inset-2 animate-[spin_10s_linear_infinite] rounded-full border border-dashed border-zinc-700/60 opacity-80"></div>
              <div className="absolute inset-5 animate-[spin_15s_linear_infinite] rounded-full border border-zinc-800"></div>
              {/* Spinning CD/Vinyl Label */}
              <div className="relative flex h-20 w-20 animate-[spin_6s_linear_infinite] items-center justify-center rounded-full bg-gradient-to-tr from-emerald-600 via-emerald-500 to-teal-400 shadow-inner group-hover:scale-105 transition-transform duration-300">
                {/* Hole */}
                <div className="h-6 w-6 rounded-full bg-zinc-950 border border-zinc-800"></div>
              </div>
            </div>

            <h1 className="max-w-2xl text-4xl font-extrabold tracking-tight text-white sm:text-6xl leading-[1.1]">
              Your albums,{" "}
              <span className="bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
                shuffled
              </span>
              . <br />
              Your songs,{" "}
              <span className="underline decoration-emerald-500/50 decoration-wavy underline-offset-8">
                in order
              </span>
              .
            </h1>

            <p className="mt-6 max-w-xl text-lg leading-relaxed text-zinc-400">
              Build custom Spotify playlists that play like a physical CD changer. 
              Hear each record from start to finish, then jump to the next shuffled album.
            </p>

            <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row">
              <button
                onClick={handleLogin}
                className="flex items-center gap-3 rounded-full bg-emerald-500 px-8 py-4 text-base font-bold text-zinc-950 transition-all duration-300 hover:scale-[1.02] hover:bg-emerald-400 hover:shadow-[0_0_30px_rgba(16,185,129,0.4)] active:scale-[0.98]"
              >
                {/* Spotify Icon */}
                <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24">
                  <path d="M12 .007c-6.627 0-12 5.372-12 12s5.373 12 12 12 12-5.372 12-12-5.373-12-12-12zm5.49 17.306c-.234.368-.718.489-1.087.254-2.996-1.83-6.766-2.245-11.203-1.233-.42.096-.84-.17-.936-.59-.096-.42.17-.84.59-.936 4.866-1.112 9.023-.637 12.38 1.417.369.235.49.719.256 1.088zm1.467-3.258c-.295.479-.922.636-1.4.34-3.428-2.108-8.653-2.72-12.705-1.491-.539.163-1.113-.147-1.276-.687-.163-.539.148-1.113.687-1.276 4.636-1.407 10.395-.733 14.354 1.704.479.295.636.921.34 1.4zm.105-3.395c-4.108-2.44-10.873-2.665-14.795-1.474-.629.19-1.296-.165-1.487-.793-.191-.63.165-1.297.793-1.487 4.502-1.367 11.977-1.101 16.7 1.703.565.335.75.1.415.75-.336.565-1.066.75-1.626.401z" />
                </svg>
                Connect Spotify Account
              </button>
            </div>

            {/* Feature Highlights Grid */}
            <div className="mt-20 grid grid-cols-1 gap-6 sm:grid-cols-3 text-left w-full">
              <div className="rounded-2xl border border-zinc-900 bg-zinc-900/25 p-6 backdrop-blur-sm">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400 mb-4 font-bold text-lg">1</div>
                <h3 className="text-lg font-bold text-white">Choose a Playlist</h3>
                <p className="mt-2 text-sm text-zinc-400 leading-relaxed">
                  Select any playlist from your Spotify library. We will group all the tracks by album automatically.
                </p>
              </div>

              <div className="rounded-2xl border border-zinc-900 bg-zinc-900/25 p-6 backdrop-blur-sm">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400 mb-4 font-bold text-lg">2</div>
                <h3 className="text-lg font-bold text-white">Shuffle the Stack</h3>
                <p className="mt-2 text-sm text-zinc-400 leading-relaxed">
                  We shuffle the album groups using a seed value, ensuring each album plays in its true running order.
                </p>
              </div>

              <div className="rounded-2xl border border-zinc-900 bg-zinc-900/25 p-6 backdrop-blur-sm">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400 mb-4 font-bold text-lg">3</div>
                <h3 className="text-lg font-bold text-white">Sync & Enjoy</h3>
                <p className="mt-2 text-sm text-zinc-400 leading-relaxed">
                  Save the road-trip-ready list back as a new playlist. Seed-reproducible shuffles let you replay your favorites.
                </p>
              </div>
            </div>
          </div>
        ) : (
          /* AUTHENTICATED STATE */
          <div className="w-full max-w-4xl">
            {/* Success Banner */}
            <div className="mb-8 flex items-center justify-between rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-6 py-4 backdrop-blur-sm">
              <div className="flex items-center gap-3">
                <span className="flex h-3 w-3 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                </span>
                <span className="text-sm font-semibold text-emerald-400">
                  Spotify Account Connected Successfully
                </span>
              </div>
              <span className="text-xs text-emerald-500/70 uppercase tracking-widest font-mono">
                Session Active
              </span>
            </div>

            <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
              {/* User Profile Card */}
              <div className="flex flex-col items-center text-center rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 backdrop-blur-xl md:col-span-1 shadow-xl">
                {isProfileLoading ? (
                  <div className="flex flex-col items-center justify-center h-48 w-full">
                    <div className="h-10 w-10 animate-spin rounded-full border-t-2 border-emerald-500"></div>
                  </div>
                ) : profile ? (
                  <>
                    <div className="relative mb-4 h-24 w-24 overflow-hidden rounded-full border-2 border-emerald-500 shadow-lg">
                      {profile.images?.[0]?.url ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={profile.images[0].url}
                          alt={profile.display_name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-zinc-800 text-3xl font-bold text-zinc-400">
                          {profile.display_name?.[0]?.toUpperCase()}
                        </div>
                      )}
                    </div>
                    <h2 className="text-xl font-bold text-white">{profile.display_name}</h2>
                    <p className="text-sm text-zinc-500 mt-1">{profile.email || "No email shared"}</p>
                    <div className="mt-4 rounded-full bg-zinc-800/80 px-3 py-1 text-xs font-mono text-emerald-400 border border-zinc-700">
                      ID: {profile.id}
                    </div>
                  </>
                ) : (
                  <div className="text-zinc-500 text-sm">Failed to load Spotify profile.</div>
                )}
              </div>

              {/* Shuffler Cockpit Preview */}
              <div className="flex flex-col justify-between rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 backdrop-blur-xl md:col-span-2 shadow-xl">
                <div>
                  <div className="flex items-center justify-between border-b border-zinc-800/80 pb-4 mb-6">
                    <h2 className="text-xl font-bold text-white">Shuffle Cockpit</h2>
                    <span className="rounded bg-zinc-800 px-2.5 py-1 text-xs font-semibold text-zinc-400">
                      Recipe Mode
                    </span>
                  </div>

                  <div className="space-y-4 opacity-50 pointer-events-none select-none">
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500 mb-2">
                        Select Source Playlist
                      </label>
                      <div className="w-full rounded-lg bg-zinc-950 border border-zinc-800 p-3 text-sm text-zinc-600">
                        Select a playlist to shuffle...
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500 mb-2">
                          Shuffle Seed
                        </label>
                        <div className="w-full rounded-lg bg-zinc-950 border border-zinc-800 p-3 text-sm text-zinc-600">
                          123456789
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500 mb-2">
                          Output Name
                        </label>
                        <div className="w-full rounded-lg bg-zinc-950 border border-zinc-800 p-3 text-sm text-zinc-600">
                          Road Trip Shuffled
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-8 pt-6 border-t border-zinc-800/80">
                  <p className="text-xs text-zinc-500 mb-4 text-center">
                    Spotify integration complete! The next step will activate the Playlist Selector.
                  </p>
                  <button
                    disabled
                    className="w-full rounded-full bg-zinc-800 py-3.5 text-center text-sm font-bold text-zinc-500 cursor-not-allowed border border-zinc-700/50"
                  >
                    Shuffling Activated in Next Step
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="z-10 py-8 text-center text-xs text-zinc-600 border-t border-zinc-900 bg-zinc-950/20">
        <p>© {new Date().getFullYear()} Road Trip Shuffle. Built with Next.js & Supabase.</p>
      </footer>
    </div>
  );
}
