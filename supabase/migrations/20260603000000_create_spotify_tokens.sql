-- Create table for storing Spotify OAuth tokens per user.
-- Access token and refresh token are needed to make calls to Spotify's API on the server.
CREATE TABLE public.spotify_tokens (
  user_id             UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  access_token        TEXT NOT NULL,
  refresh_token       TEXT NOT NULL,
  expires_at          TIMESTAMPTZ NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable Row-Level Security
ALTER TABLE public.spotify_tokens ENABLE ROW LEVEL SECURITY;

-- Owner-only access policy (authenticated user matches user_id)
CREATE POLICY "spotify_tokens_owner_access"
  ON public.spotify_tokens
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Index for performance on user lookup (even though it's PRIMARY KEY, we declare RLS check index/FK lookup safety)
CREATE INDEX spotify_tokens_user_id_idx ON public.spotify_tokens (user_id);
