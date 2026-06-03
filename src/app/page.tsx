"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { User } from "@supabase/supabase-js";
import { SpotifyPlaylist } from "@/lib/spotify";
import { Database } from "@/types/database";

type RecipeRow = Database["public"]["Tables"]["shuffle_recipes"]["Row"];

export default function Home() {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Cockpit States
  const [selectedPlaylistId, setSelectedPlaylistId] = useState("");
  const [seed, setSeed] = useState<number>(() => Math.floor(Math.random() * 1000000));
  const [outputName, setOutputName] = useState("");

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

  const generateRandomSeed = () => {
    setSeed(Math.floor(Math.random() * 1000000));
  };


  // Fetch Spotify profile
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

  // Fetch User Playlists
  const { data: playlists, isLoading: isPlaylistsLoading } = useQuery({
    queryKey: ["spotify-playlists", user?.id],
    queryFn: async () => {
      const response = await fetch("/api/spotify/playlists");
      if (!response.ok) {
        throw new Error("Failed to fetch playlists");
      }
      const data = await response.json();
      return data.playlists as SpotifyPlaylist[];
    },
    enabled: !!user,
  });

  // Fetch saved recipes from Supabase
  const { data: recipes, isLoading: isRecipesLoading } = useQuery({
    queryKey: ["shuffle-recipes", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shuffle_recipes")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Auto-populate Output Name on selection
  const handlePlaylistChange = (playlistId: string) => {
    setSelectedPlaylistId(playlistId);
    if (playlists) {
      const selected = playlists.find((p) => p.id === playlistId);
      if (selected) {
        setOutputName(`${selected.name} (Road Trip Shuffled)`);
      }
    }
  };

  // Shuffle Mutation
  const shuffleMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/shuffle", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sourcePlaylistId: selectedPlaylistId,
          seed,
          outputName,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Shuffle execution failed");
      }

      return response.json();
    },
    onSuccess: () => {
      // Invalidate recipes query to refresh the list
      queryClient.invalidateQueries({ queryKey: ["shuffle-recipes", user?.id] });
    },
  });

  const handleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "spotify",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        scopes: "playlist-read-private playlist-read-collaborative playlist-modify-public playlist-modify-private user-read-private user-read-email",
        queryParams: {
          show_dialog: "true",
        },
      },
    });
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const loadRecipe = (recipe: RecipeRow) => {
    setSelectedPlaylistId(recipe.source_playlist_id);
    setSeed(Number(recipe.seed));
    setOutputName(recipe.name);
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
      <main className="z-10 flex flex-1 flex-col items-center justify-start px-6 py-12 md:px-12 w-full">
        {!user ? (
          /* LANDING STATE */
          <div className="flex max-w-4xl flex-col items-center text-center mt-12">
            {/* Spinning CD Graphic */}
            <div className="group relative mb-8 flex h-36 w-36 items-center justify-center rounded-full bg-zinc-900 shadow-2xl border-4 border-zinc-800">
              <div className="absolute inset-2 animate-[spin_10s_linear_infinite] rounded-full border border-dashed border-zinc-700/60 opacity-80"></div>
              <div className="absolute inset-5 animate-[spin_15s_linear_infinite] rounded-full border border-zinc-800"></div>
              <div className="relative flex h-20 w-20 animate-[spin_6s_linear_infinite] items-center justify-center rounded-full bg-gradient-to-tr from-emerald-600 via-emerald-500 to-teal-400 shadow-inner group-hover:scale-105 transition-transform duration-300">
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
          <div className="w-full max-w-5xl mt-6">
            {/* Status Notifications */}
            {shuffleMutation.isSuccess && (
              <div className="mb-6 flex flex-col sm:flex-row items-center justify-between gap-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-6 py-4 backdrop-blur-sm">
                <div className="flex items-center gap-3">
                  <span className="text-xl">🎉</span>
                  <div>
                    <h4 className="font-bold text-white text-sm">Shuffle Successful!</h4>
                    <p className="text-xs text-zinc-300">
                      Created playlist with {shuffleMutation.data.tracksCount} tracks.
                    </p>
                  </div>
                </div>
                <a
                  href={shuffleMutation.data.playlistUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-full bg-emerald-500 hover:bg-emerald-400 px-5 py-2 text-xs font-bold text-zinc-950 transition-all shadow-[0_0_15px_rgba(16,185,129,0.3)]"
                >
                  Open in Spotify
                </a>
              </div>
            )}

            {shuffleMutation.isError && (
              <div className="mb-6 rounded-2xl border border-red-500/30 bg-red-500/10 px-6 py-4 text-sm text-red-400 backdrop-blur-sm flex items-center gap-3">
                <span>⚠️</span>
                <div>
                  <h4 className="font-bold">Shuffle Failed</h4>
                  <p className="text-xs opacity-90">{shuffleMutation.error.message}</p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
              {/* User Profile Card */}
              <div className="flex flex-col items-center text-center rounded-2xl border border-zinc-900 bg-zinc-900/30 p-6 backdrop-blur-md lg:col-span-1 shadow-xl h-fit">
                {isProfileLoading ? (
                  <div className="flex flex-col items-center justify-center h-48 w-full">
                    <div className="h-8 w-8 animate-spin rounded-full border-t-2 border-emerald-500"></div>
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
                    <div className="mt-3 flex items-center gap-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 text-xs font-mono text-emerald-400">
                      <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
                      Connected
                    </div>
                  </>
                ) : (
                  <div className="text-zinc-500 text-sm">Failed to load Spotify profile.</div>
                )}
              </div>

              {/* Shuffler Cockpit */}
              <div className="flex flex-col justify-between rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 backdrop-blur-xl lg:col-span-2 shadow-xl">
                <div>
                  <div className="flex items-center justify-between border-b border-zinc-800/80 pb-4 mb-6">
                    <h2 className="text-xl font-bold text-white">Shuffle Cockpit</h2>
                    <span className="rounded bg-zinc-800 px-2.5 py-1 text-xs font-semibold text-zinc-400">
                      CD Changer Mode
                    </span>
                  </div>

                  <div className="space-y-5">
                    {/* Source Playlist Selection */}
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2">
                        Select Source Playlist
                      </label>
                      {isPlaylistsLoading ? (
                        <div className="h-11 w-full rounded-lg bg-zinc-950/50 border border-zinc-800/80 flex items-center px-4">
                          <div className="h-4 w-4 animate-spin rounded-full border-t border-emerald-500 mr-2"></div>
                          <span className="text-xs text-zinc-500">Loading playlists...</span>
                        </div>
                      ) : (
                        <select
                          value={selectedPlaylistId}
                          onChange={(e) => handlePlaylistChange(e.target.value)}
                          className="w-full rounded-lg bg-zinc-950 border border-zinc-800/80 p-3 text-sm text-zinc-200 outline-none focus:border-emerald-500 transition-colors"
                        >
                          <option value="">-- Choose a playlist --</option>
                          {playlists?.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} ({p.tracks.total} tracks)
                            </option>
                          ))}
                        </select>
                      )}
                    </div>

                    {/* Shuffle Configuration */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2">
                          Shuffle Seed
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="number"
                            value={seed}
                            onChange={(e) => setSeed(Number(e.target.value))}
                            className="w-full rounded-lg bg-zinc-950 border border-zinc-800/80 p-3 text-sm text-zinc-200 outline-none focus:border-emerald-500 transition-colors"
                          />
                          <button
                            onClick={generateRandomSeed}
                            type="button"
                            className="rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700/50 px-4 text-xs font-semibold text-zinc-300 transition-all active:scale-95"
                            title="Generate Random Seed"
                          >
                            🎲
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2">
                          Output Playlist Name
                        </label>
                        <input
                          type="text"
                          value={outputName}
                          onChange={(e) => setOutputName(e.target.value)}
                          placeholder="My Playlist (Road Trip Shuffled)"
                          className="w-full rounded-lg bg-zinc-950 border border-zinc-800/80 p-3 text-sm text-zinc-200 outline-none focus:border-emerald-500 transition-colors"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-8 pt-6 border-t border-zinc-800/80">
                  <button
                    disabled={!selectedPlaylistId || !outputName || shuffleMutation.isPending}
                    onClick={() => shuffleMutation.mutate()}
                    className={`w-full rounded-full py-4 text-center text-sm font-bold transition-all duration-300 shadow-md ${
                      !selectedPlaylistId || !outputName
                        ? "bg-zinc-800 text-zinc-500 cursor-not-allowed border border-zinc-700/30"
                        : "bg-emerald-500 hover:bg-emerald-400 text-zinc-950 hover:shadow-[0_0_20px_rgba(16,185,129,0.3)] active:scale-[0.99]"
                    }`}
                  >
                    {shuffleMutation.isPending ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="h-4 w-4 animate-spin rounded-full border-t-2 border-r-2 border-zinc-950"></span>
                        Shuffling Tracks & Syncing...
                      </span>
                    ) : (
                      "Shuffle & Sync to Spotify"
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Saved Recipes Panel */}
            <div className="mt-8 rounded-2xl border border-zinc-900 bg-zinc-900/20 p-6 backdrop-blur-md shadow-xl">
              <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <span>🗄️</span> Saved Shuffle Recipes
              </h3>

              {isRecipesLoading ? (
                <div className="flex items-center justify-center py-10">
                  <div className="h-6 w-6 animate-spin rounded-full border-t border-emerald-500"></div>
                </div>
              ) : recipes && recipes.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {recipes.map((r) => (
                    <div
                      key={r.id}
                      className="group rounded-xl border border-zinc-800 bg-zinc-950/40 p-4 hover:border-zinc-700 transition-all flex flex-col justify-between"
                    >
                      <div>
                        <h4 className="font-bold text-white text-sm truncate">{r.name}</h4>
                        <div className="mt-2 space-y-1 text-xs text-zinc-500">
                          <p>🌱 Seed: <span className="font-mono text-zinc-300">{r.seed}</span></p>
                          <p>📅 Shuffled: {new Date(r.created_at).toLocaleDateString()}</p>
                        </div>
                      </div>
                      <div className="mt-4 flex items-center justify-between gap-2 border-t border-zinc-900 pt-3">
                        <button
                          onClick={() => loadRecipe(r)}
                          className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition-colors"
                        >
                          Load Settings
                        </button>
                        {r.output_playlist_id && (
                          <a
                            href={`https://open.spotify.com/playlist/${r.output_playlist_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-zinc-500 hover:text-white transition-colors"
                          >
                            Open Link
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-10 rounded-xl border border-dashed border-zinc-800">
                  <p className="text-sm text-zinc-500">No shuffle recipes saved yet.</p>
                  <p className="text-xs text-zinc-600 mt-1">Shuffle a playlist to create your first recipe!</p>
                </div>
              )}
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
