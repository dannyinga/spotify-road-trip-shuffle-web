"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { User } from "@supabase/supabase-js";
import { SpotifyPlaylist } from "@/lib/spotify";
import { Database } from "@/types/database";

type RecipeRow = Database["public"]["Tables"]["shuffle_recipes"]["Row"];

const MAX_GROUP_TRACKS = 500;

interface TripMember {
  user_id: string;
  role: string;
  spotify_playlist_id: string | null;
  spotify_playlist_name: string | null;
  spotify_playlist_track_count: number | null;
  weight: number;
  joined_at: string;
  display_name: string;
  avatar_url: string | null;
}

export default function Home() {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Cockpit States
  const [selectedPlaylistId, setSelectedPlaylistId] = useState("");
  const [seed, setSeed] = useState<number>(() => Math.floor(Math.random() * 1000000));
  const [outputName, setOutputName] = useState("");
  const [userSelectedMode, setUserSelectedMode] = useState<"personal" | "group" | null>(null);
  const [prevTripId, setPrevTripId] = useState<string | null>(null);

  // Cabin Creation/Joining states
  const [newTripName, setNewTripName] = useState("");
  const [joinInviteCode, setJoinInviteCode] = useState("");
  const [copied, setCopied] = useState(false);

  // Passenger contribution states
  const [passengerPlaylistId, setPassengerPlaylistId] = useState("");
  const [tempWeights, setTempWeights] = useState<Record<string, number>>({});

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

  // Fetch active multi-tenant road trip (polls every 5 seconds for live passenger updates)
  const { data: tripData, isLoading: isTripLoading } = useQuery({
    queryKey: ["active-trip", user?.id],
    queryFn: async () => {
      const response = await fetch("/api/trips");
      if (!response.ok) throw new Error("Failed to fetch active trip");
      return response.json();
    },
    enabled: !!user,
    refetchInterval: 5000,
  });

  const activeTrip = tripData?.trip;

  const membersWithPlaylist = activeTrip?.members?.filter((m: TripMember) => m.spotify_playlist_id) || [];
  const totalTracksRaw = membersWithPlaylist.reduce((acc: number, m: TripMember) => acc + (m.spotify_playlist_track_count || 0), 0);

  // Active total weight taking tempWeights into account for real-time updates while dragging
  const activeTotalWeight = membersWithPlaylist.reduce((acc: number, m: TripMember) => acc + (tempWeights[m.user_id] ?? m.weight), 0);

  // Total tracks actually pooled after capping at playlist track counts
  const totalPooledTracksCount = membersWithPlaylist.reduce((acc: number, member: TripMember) => {
    const activeWeight = tempWeights[member.user_id] ?? member.weight;
    const rawShare = totalTracksRaw <= MAX_GROUP_TRACKS
      ? (member.spotify_playlist_track_count || 0)
      : activeTotalWeight > 0
        ? Math.floor(MAX_GROUP_TRACKS * (activeWeight / activeTotalWeight))
        : 0;
    return acc + Math.min(member.spotify_playlist_track_count || 0, rawShare);
  }, 0);

  // Derive cockpitMode based on user override or active trip presence
  const cockpitMode = userSelectedMode || (activeTrip ? "group" : "personal");

  // Adjust local form state inside render phase when trip details load/change
  const targetTripId = activeTrip?.id || null;
  if (targetTripId !== prevTripId) {
    setPrevTripId(targetTripId);
    if (activeTrip) {
      if (userSelectedMode !== "group") {
        setUserSelectedMode("group");
      }
      const targetOutputName = `${activeTrip.name} Shuffled Mix`;
      if (outputName !== targetOutputName) {
        setOutputName(targetOutputName);
      }
      const me = activeTrip.members?.find((m: TripMember) => m.user_id === user?.id);
      const targetPlaylistId = me?.spotify_playlist_id || "";
      if (passengerPlaylistId !== targetPlaylistId) {
        setPassengerPlaylistId(targetPlaylistId);
      }
    } else {
      if (userSelectedMode !== "personal") {
        setUserSelectedMode("personal");
      }
    }
  }

  // Auto-populate Personal Output Name on selection
  const handlePlaylistChange = (playlistId: string) => {
    setSelectedPlaylistId(playlistId);
    if (playlists) {
      const selected = playlists.find((p) => p.id === playlistId);
      if (selected) {
        setOutputName(`${selected.name} (Road Trip Shuffled)`);
      }
    }
  };

  // Personal Shuffle Mutation
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
      queryClient.invalidateQueries({ queryKey: ["shuffle-recipes", user?.id] });
      generateRandomSeed();
    },
  });

  // Create Trip Mutation
  const createTripMutation = useMutation({
    mutationFn: async (name: string) => {
      const response = await fetch("/api/trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to create trip");
      }
      return response.json();
    },
    onSuccess: () => {
      setNewTripName("");
      queryClient.invalidateQueries({ queryKey: ["active-trip", user?.id] });
    },
  });

  // Join Trip Mutation
  const joinTripMutation = useMutation({
    mutationFn: async (inviteCode: string) => {
      const response = await fetch("/api/trips/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteCode }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to join trip");
      }
      return response.json();
    },
    onSuccess: () => {
      setJoinInviteCode("");
      queryClient.invalidateQueries({ queryKey: ["active-trip", user?.id] });
    },
  });

  // Leave/Delete Trip Mutation
  const leaveTripMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/trips", {
        method: "DELETE",
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to leave trip");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["active-trip", user?.id] });
    },
  });

  // Delete Saved Recipe Mutation
  const deleteRecipeMutation = useMutation({
    mutationFn: async (recipeId: string) => {
      const { error } = await supabase
        .from("shuffle_recipes")
        .delete()
        .eq("id", recipeId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shuffle-recipes", user?.id] });
    },
  });

  // Update Passenger Playlist contribution mutation
  const updatePassengerPlaylistMutation = useMutation({
    mutationFn: async (variables: { playlistId: string; playlistName: string; trackCount?: number; weight?: number }) => {
      const response = await fetch("/api/trips/update-playlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tripId: activeTrip.id,
          ...variables,
        }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to update contribution");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["active-trip", user?.id] });
    },
  });

  // Update member weight mutation (Driver/Host only)
  const updateMemberWeightMutation = useMutation({
    mutationFn: async ({ memberId, weight }: { memberId: string; weight: number }) => {
      const { error } = await supabase
        .from("road_trip_members")
        .update({ weight })
        .eq("trip_id", activeTrip.id)
        .eq("user_id", memberId);
      if (error) throw error;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["active-trip", user?.id] });
      setTempWeights((prev) => {
        const next = { ...prev };
        delete next[variables.memberId];
        return next;
      });
    },
  });

  // Group Shuffle Mutation (Host-Only)
  const groupShuffleMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/trips/shuffle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tripId: activeTrip.id,
          seed,
          outputName,
        }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Group shuffle failed");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shuffle-recipes", user?.id] });
      generateRandomSeed();
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

  const copyToClipboard = () => {
    if (activeTrip?.invite_code) {
      navigator.clipboard.writeText(activeTrip.invite_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const submitPlaylistContribution = () => {
    const selected = playlists?.find((p) => p.id === passengerPlaylistId);
    updatePassengerPlaylistMutation.mutate({
      playlistId: passengerPlaylistId,
      playlistName: selected ? selected.name : "",
      trackCount: selected ? selected.tracks.total : 0,
    });
  };

  const isHost = activeTrip?.host_id === user?.id;

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

  // Active status notifications
  const activeMutation = cockpitMode === "group" ? groupShuffleMutation : shuffleMutation;

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
            {activeMutation.isSuccess && (
              <div className="mb-6 flex flex-col sm:flex-row items-center justify-between gap-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-6 py-4 backdrop-blur-sm">
                <div className="flex items-center gap-3">
                  <span className="text-xl">🎉</span>
                  <div>
                    <h4 className="font-bold text-white text-sm">Shuffle Successful!</h4>
                    <p className="text-xs text-zinc-300">
                      Created playlist with {activeMutation.data.tracksCount} tracks.
                    </p>
                  </div>
                </div>
                <a
                  href={activeMutation.data.playlistUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-full bg-emerald-500 hover:bg-emerald-400 px-5 py-2 text-xs font-bold text-zinc-950 transition-all shadow-[0_0_15px_rgba(16,185,129,0.3)]"
                >
                  Open in Spotify
                </a>
              </div>
            )}

            {activeMutation.isError && (
              <div className="mb-6 rounded-2xl border border-red-500/30 bg-red-500/10 px-6 py-4 text-sm text-red-400 backdrop-blur-sm flex items-center gap-3">
                <span>⚠️</span>
                <div>
                  <h4 className="font-bold">Shuffle Failed</h4>
                  <p className="text-xs opacity-90">{activeMutation.error.message}</p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
              {/* Left Column (Stacking Profile and Cabin) */}
              <div className="flex flex-col gap-8 lg:col-span-1">
                {/* User Profile Card */}
                <div className="flex flex-col items-center text-center rounded-2xl border border-zinc-900 bg-zinc-900/30 p-6 backdrop-blur-md shadow-xl h-fit">
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

                {/* Road Trip Cabin (Multi-Tenant Hub) */}
                <div className="rounded-2xl border border-zinc-900 bg-zinc-900/30 p-6 backdrop-blur-md shadow-xl">
                  <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                    <span>🚗</span> Road Trip Cabin
                  </h3>

                  {isTripLoading ? (
                    <div className="flex items-center justify-center py-6">
                      <div className="h-6 w-6 animate-spin rounded-full border-t border-emerald-500"></div>
                    </div>
                  ) : !activeTrip ? (
                    /* STATE: UNJOINED */
                    <div className="space-y-4">
                      <p className="text-xs text-zinc-400 leading-relaxed">
                        Gather your passengers! Create a trip cabin or join an existing one to pool playlists and shuffle your music together.
                      </p>

                      {/* Create Cabin */}
                      <div className="pt-2 border-t border-zinc-900">
                        <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500 mb-1.5">
                          Create a Cabin
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            placeholder="e.g. Vegas Bound"
                            value={newTripName}
                            onChange={(e) => setNewTripName(e.target.value)}
                            className="w-full rounded-lg bg-zinc-950 border border-zinc-800/80 px-3 py-2 text-xs text-zinc-200 outline-none focus:border-emerald-500"
                          />
                          <button
                            onClick={() => createTripMutation.mutate(newTripName)}
                            disabled={!newTripName || createTripMutation.isPending}
                            className="rounded-lg bg-emerald-500 hover:bg-emerald-400 px-3 py-2 text-xs font-bold text-zinc-950 disabled:opacity-50"
                          >
                            Create
                          </button>
                        </div>
                      </div>

                      {/* Join Cabin */}
                      <div className="pt-2 border-t border-zinc-900">
                        <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500 mb-1.5">
                          Join with Invite Code
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            placeholder="e.g. TRIP12"
                            value={joinInviteCode}
                            onChange={(e) => setJoinInviteCode(e.target.value)}
                            className="w-full rounded-lg bg-zinc-950 border border-zinc-800/80 px-3 py-2 text-xs text-zinc-200 outline-none focus:border-emerald-500 uppercase"
                          />
                          <button
                            onClick={() => joinInviteCode && joinTripMutation.mutate(joinInviteCode)}
                            disabled={!joinInviteCode || joinTripMutation.isPending}
                            className="rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700/50 px-3 py-2 text-xs font-bold text-zinc-300 disabled:opacity-50"
                          >
                            Join
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* STATE: JOINED */
                    <div className="space-y-4">
                      {/* Trip Header */}
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="font-bold text-white text-sm">{activeTrip.name}</h4>
                          <span className="text-zinc-500 text-[10px] uppercase font-bold tracking-wider">
                            {isHost ? "👑 Host" : "🚗 Passenger"}
                          </span>
                        </div>
                        <button
                          onClick={copyToClipboard}
                          className="flex items-center gap-1 rounded bg-zinc-800/80 hover:bg-zinc-700 border border-zinc-700/50 px-2 py-1 text-[10px] font-mono text-zinc-300 transition-all"
                        >
                          Code: <span className="font-bold text-emerald-400">{activeTrip.invite_code}</span>
                          <span className="ml-1 text-[8px]">{copied ? "Copied!" : "📋"}</span>
                        </button>
                      </div>

                      {/* Passenger List */}
                      <div className="border-t border-zinc-900 pt-3">
                        <span className="block text-xs font-bold uppercase tracking-wider text-zinc-500 mb-2">
                          Active Crew ({activeTrip.members?.length || 0})
                        </span>
                        <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                          {activeTrip.members?.map((member: TripMember) => {
                            const hasPlaylist = !!member.spotify_playlist_id;
                            const activeWeight = tempWeights[member.user_id] ?? member.weight;
                            const rawShare = hasPlaylist
                              ? totalTracksRaw <= MAX_GROUP_TRACKS
                                ? (member.spotify_playlist_track_count || 0)
                                : activeTotalWeight > 0
                                  ? Math.floor(MAX_GROUP_TRACKS * (activeWeight / activeTotalWeight))
                                  : 0
                              : 0;
                            const share = Math.min(member.spotify_playlist_track_count || 0, rawShare);
                            const showWeights = totalTracksRaw > MAX_GROUP_TRACKS;
                            return (
                              <div key={member.user_id} className="flex flex-col gap-2 p-2 rounded-lg bg-zinc-950/40 border border-zinc-900/50">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-2">
                                    {member.avatar_url ? (
                                      /* eslint-disable-next-line @next/next/no-img-element */
                                      <img
                                        src={member.avatar_url}
                                        alt={member.display_name}
                                        className="h-6 w-6 rounded-full object-cover border border-zinc-800"
                                      />
                                    ) : (
                                      <div className="h-6 w-6 rounded-full bg-zinc-800 flex items-center justify-center text-[10px] font-bold text-zinc-400 border border-zinc-700">
                                        {member.display_name?.[0]?.toUpperCase()}
                                      </div>
                                    )}
                                    <div className="leading-none">
                                      <span className="text-xs font-semibold text-zinc-200 truncate max-w-[120px] block">
                                        {member.display_name}
                                      </span>
                                      <span className="text-[9px] text-zinc-500 block truncate max-w-[120px] mt-0.5">
                                        {member.spotify_playlist_name || "No playlist connected"}
                                      </span>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    {hasPlaylist && (
                                      <span className="text-[9px] font-mono text-zinc-400 bg-zinc-900/80 border border-zinc-800/50 px-1.5 py-0.5 rounded">
                                        {share} tracks
                                      </span>
                                    )}
                                    {showWeights && (
                                      <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded" title="Shuffle share weight">
                                        w:{activeWeight}
                                      </span>
                                    )}
                                    {member.role === "admin" && <span className="text-[9px]" title="Host">👑</span>}
                                  </div>
                                </div>

                                {isHost && showWeights && (
                                  <div className="flex items-center gap-2 px-1 border-t border-zinc-900/40 pt-1.5">
                                    <span className="text-[8px] text-zinc-500 uppercase tracking-wider font-semibold">Weight:</span>
                                    <input
                                      type="range"
                                      min="1"
                                      max="10"
                                      value={tempWeights[member.user_id] ?? member.weight}
                                      onChange={(e) => {
                                        const val = Number(e.target.value);
                                        setTempWeights((prev) => ({ ...prev, [member.user_id]: val }));
                                      }}
                                      onMouseUp={() => {
                                        const val = tempWeights[member.user_id] ?? member.weight;
                                        updateMemberWeightMutation.mutate({
                                          memberId: member.user_id,
                                          weight: val,
                                        });
                                      }}
                                      onTouchEnd={() => {
                                        const val = tempWeights[member.user_id] ?? member.weight;
                                        updateMemberWeightMutation.mutate({
                                          memberId: member.user_id,
                                          weight: val,
                                        });
                                      }}
                                      className="flex-1 h-1 bg-zinc-900 rounded-lg appearance-none cursor-pointer accent-emerald-500 hover:accent-emerald-400 transition-all"
                                    />
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Passenger Playlist Selector & Weight settings */}
                      <div className="border-t border-zinc-900 pt-3 space-y-3">
                        <span className="block text-xs font-bold uppercase tracking-wider text-zinc-500">
                          My Contribution
                        </span>

                        <div>
                          <label className="block text-[10px] text-zinc-500 mb-1">Select Playlist</label>
                          {isPlaylistsLoading ? (
                            <div className="h-9 w-full rounded-lg bg-zinc-950 border border-zinc-900 flex items-center px-3">
                              <span className="text-[10px] text-zinc-600 animate-pulse">Loading...</span>
                            </div>
                          ) : (
                            <select
                              value={passengerPlaylistId}
                              onChange={(e) => setPassengerPlaylistId(e.target.value)}
                              className="w-full rounded-lg bg-zinc-950 border border-zinc-900 p-2 text-xs text-zinc-200 outline-none"
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

                        <div className="flex justify-end pt-1">
                          <button
                            onClick={submitPlaylistContribution}
                            disabled={updatePassengerPlaylistMutation.isPending}
                            className="rounded-lg bg-emerald-500 hover:bg-emerald-400 px-4 py-2 text-xs font-bold text-zinc-950 shadow-sm disabled:opacity-50"
                          >
                            Update Playlist
                          </button>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="border-t border-zinc-900 pt-3 flex gap-2">
                        <button
                          onClick={() => leaveTripMutation.mutate()}
                          disabled={leaveTripMutation.isPending}
                          className="w-full rounded-lg border border-red-900 bg-red-950/20 hover:bg-red-950/40 py-2 text-center text-xs font-bold text-red-400 transition-colors"
                        >
                          {isHost ? "Delete Cabin" : "Leave Cabin"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Shuffler Cockpit */}
              <div className="flex flex-col justify-between rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 backdrop-blur-xl lg:col-span-2 shadow-xl">
                <div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800/80 pb-4 mb-6">
                    <div className="flex items-center gap-3">
                      <h2 className="text-xl font-bold text-white">Shuffle Cockpit</h2>
                      {activeTrip && (
                        <div className="flex rounded-lg bg-zinc-950 p-1 border border-zinc-800/80 text-xs">
                          <button
                            onClick={() => setUserSelectedMode("personal")}
                            className={`px-3 py-1.5 rounded-md font-semibold transition-all ${
                              cockpitMode === "personal"
                                ? "bg-zinc-900 text-white"
                                : "text-zinc-500 hover:text-zinc-300"
                            }`}
                          >
                            Personal
                          </button>
                          <button
                            onClick={() => setUserSelectedMode("group")}
                            className={`px-3 py-1.5 rounded-md font-semibold transition-all ${
                              cockpitMode === "group"
                                ? "bg-zinc-900 text-white"
                                : "text-zinc-500 hover:text-zinc-300"
                            }`}
                          >
                            Cabin
                          </button>
                        </div>
                      )}
                    </div>
                    <span className="rounded bg-zinc-800 px-2.5 py-1 text-xs font-semibold text-zinc-400 self-start sm:self-center">
                      {cockpitMode === "group" ? "Multi-Tenant Crew Mode" : "CD Changer Mode"}
                    </span>
                  </div>

                  {cockpitMode === "group" ? (
                    /* GROUP COCKPIT STATE */
                    <div className="space-y-5">
                      <div className="rounded-xl border border-zinc-900 bg-zinc-950/30 p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="block text-xs font-bold uppercase tracking-wider text-zinc-500">
                            Pooled Playlists in this Shuffle
                          </span>
                          <span className="text-xs text-zinc-400 font-medium">
                            Total Pooled: <span className="font-bold text-emerald-400">{totalPooledTracksCount}</span> tracks
                          </span>
                        </div>
                        {totalTracksRaw > MAX_GROUP_TRACKS && (
                          <div className="mb-3 rounded bg-zinc-900/50 border border-zinc-800/80 p-2 text-[10px] text-zinc-400">
                            💡 Total tracks exceed {MAX_GROUP_TRACKS} limit. Host can adjust weights in the Active Crew list to set proportions.
                          </div>
                        )}
                        {totalTracksRaw > 0 && totalTracksRaw <= MAX_GROUP_TRACKS && (
                          <div className="mb-3 rounded bg-emerald-500/5 border border-emerald-500/10 p-2 text-[10px] text-emerald-400/90">
                            ✨ Total tracks under {MAX_GROUP_TRACKS} limit. Every track from all connected playlists will be included!
                          </div>
                        )}
                        <div className="space-y-1.5">
                          {activeTrip?.members?.filter((m: TripMember) => m.spotify_playlist_id).map((member: TripMember) => {
                            const activeWeight = tempWeights[member.user_id] ?? member.weight;
                            const rawShare = totalTracksRaw <= MAX_GROUP_TRACKS
                              ? (member.spotify_playlist_track_count || 0)
                              : activeTotalWeight > 0
                                ? Math.floor(MAX_GROUP_TRACKS * (activeWeight / activeTotalWeight))
                                : 0;
                            const share = Math.min(member.spotify_playlist_track_count || 0, rawShare);
                            return (
                              <div key={member.user_id} className="flex items-center justify-between text-xs p-2 rounded bg-zinc-950/50">
                                <div className="flex items-center gap-2">
                                  <span className="text-zinc-300 font-semibold">{member.display_name}</span>
                                  <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded font-mono">
                                    {share} tracks
                                  </span>
                                </div>
                                <span className="text-zinc-500 truncate max-w-[150px] md:max-w-xs">
                                  🎵 {member.spotify_playlist_name}
                                </span>
                              </div>
                            );
                          })}
                          {activeTrip?.members?.filter((m: TripMember) => m.spotify_playlist_id).length === 0 && (
                            <p className="text-xs text-zinc-600 text-center py-2">
                              No crew member has connected a playlist yet. Update your contribution on the left panel!
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Group Configuration */}
                      <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2">
                          Output Playlist Name
                        </label>
                        <input
                          type="text"
                          value={outputName}
                          onChange={(e) => setOutputName(e.target.value)}
                          placeholder="e.g. Road Trip Cabin Mix"
                          className="w-full rounded-lg bg-zinc-950 border border-zinc-800/80 p-3 text-sm text-zinc-200 outline-none focus:border-emerald-500 transition-colors"
                        />
                      </div>
                    </div>
                  ) : (
                    /* PERSONAL COCKPIT STATE */
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
                  )}
                </div>

                <div className="mt-8 pt-6 border-t border-zinc-800/80">
                  {cockpitMode === "group" ? (
                    /* GROUP SHUFFLE BUTTON (Host only vs Passenger waiting) */
                    isHost ? (
                      <button
                        disabled={
                          !activeTrip?.members?.some((m: TripMember) => m.spotify_playlist_id) ||
                          !outputName ||
                          groupShuffleMutation.isPending
                        }
                        onClick={() => groupShuffleMutation.mutate()}
                        className={`w-full rounded-full py-4 text-center text-sm font-bold transition-all duration-300 shadow-md ${
                          !activeTrip?.members?.some((m: TripMember) => m.spotify_playlist_id) || !outputName
                            ? "bg-zinc-800 text-zinc-500 cursor-not-allowed border border-zinc-700/30"
                            : "bg-emerald-500 hover:bg-emerald-400 text-zinc-950 hover:shadow-[0_0_20px_rgba(16,185,129,0.3)] active:scale-[0.99]"
                        }`}
                      >
                        {groupShuffleMutation.isPending ? (
                          <span className="flex items-center justify-center gap-2">
                            <span className="h-4 w-4 animate-spin rounded-full border-t-2 border-r-2 border-zinc-950"></span>
                            Shuffling Group Tracks & Syncing...
                          </span>
                        ) : (
                          "Shuffle Cabin & Sync to Spotify"
                        )}
                      </button>
                    ) : (
                      <div className="w-full rounded-full py-4 bg-zinc-900 border border-zinc-800 text-zinc-500 text-center text-xs font-semibold select-none flex items-center justify-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                        Waiting for host ({activeTrip?.members?.find((m: TripMember) => m.role === "admin")?.display_name || "Host"}) to shuffle...
                      </div>
                    )
                  ) : (
                    /* PERSONAL SHUFFLE BUTTON */
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
                  )}
                </div>
              </div>
            </div>

            {/* Previous Shuffles Panel */}
            <div className="mt-8 rounded-2xl border border-zinc-900 bg-zinc-900/20 p-6 backdrop-blur-md shadow-xl">
              <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <span>🗄️</span> Previous Shuffles
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
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <h4 className="font-bold text-white text-sm truncate">{r.name}</h4>
                          {r.trip_id && (
                            <span className="rounded bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 text-[8px] font-semibold text-emerald-400 uppercase">
                              Cabin
                            </span>
                          )}
                        </div>
                        <div className="mt-2 space-y-1 text-xs text-zinc-500">
                          <p>🌱 Seed: <span className="font-mono text-zinc-300">{r.seed}</span></p>
                          <p>📅 Shuffled: {new Date(r.created_at).toLocaleDateString()}</p>
                        </div>
                      </div>
                      <div className="mt-4 flex items-center justify-between gap-2 border-t border-zinc-900 pt-3">
                        <div className="flex gap-3">
                          <button
                            disabled={!!r.trip_id} // Disable personal loading for group shuffles
                            onClick={() => loadRecipe(r)}
                            className={`text-xs font-semibold transition-colors ${
                              r.trip_id
                                ? "text-zinc-600 cursor-not-allowed"
                                : "text-emerald-400 hover:text-emerald-300"
                            }`}
                            title={r.trip_id ? "Cabin shuffles cannot be loaded into the personal cockpit" : ""}
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
                        <button
                          onClick={() => {
                            if (confirm("Are you sure you want to delete this shuffle?")) {
                              deleteRecipeMutation.mutate(r.id);
                            }
                          }}
                          disabled={deleteRecipeMutation.isPending}
                          className="text-xs font-semibold text-red-500 hover:text-red-400 disabled:opacity-50 transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-10 rounded-xl border border-dashed border-zinc-800">
                  <p className="text-sm text-zinc-500">No previous shuffles saved yet.</p>
                  <p className="text-xs text-zinc-600 mt-1">Shuffle a playlist to see it here!</p>
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
