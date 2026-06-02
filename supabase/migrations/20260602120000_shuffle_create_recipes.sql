-- Shuffle recipes: a saved "stack of CDs" the user can re-generate.
-- A recipe captures which playlist it was built from and the seed that
-- reproduces the exact road-trip ordering. Every row is owned by one user;
-- RLS scopes all access to that owner (no cross-user visibility).

CREATE TABLE public.shuffle_recipes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  -- Spotify playlist the recipe was generated from.
  source_playlist_id  TEXT NOT NULL,
  -- Spotify playlist the generated, road-trip-ordered result was written to
  -- (null until the recipe has been materialized at least once).
  output_playlist_id  TEXT,
  -- Seed passed to roadTripShuffle() so the ordering is reproducible.
  seed                BIGINT NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.shuffle_recipes ENABLE ROW LEVEL SECURITY;

-- Owner-only access. Spelled out per-command so future tightening (e.g.
-- read-only sharing) is an additive change rather than a rewrite.

CREATE POLICY "shuffle_recipes_select_own"
  ON public.shuffle_recipes
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "shuffle_recipes_insert_own"
  ON public.shuffle_recipes
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "shuffle_recipes_update_own"
  ON public.shuffle_recipes
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "shuffle_recipes_delete_own"
  ON public.shuffle_recipes
  FOR DELETE
  USING (user_id = auth.uid());

CREATE INDEX shuffle_recipes_user_id_idx ON public.shuffle_recipes (user_id);
