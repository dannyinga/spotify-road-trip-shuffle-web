-- Create marketplace_playlists table
CREATE TABLE IF NOT EXISTS public.marketplace_playlists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    tags TEXT[] NOT NULL DEFAULT '{}'::text[],
    tracks JSONB NOT NULL,
    spotify_playlist_url TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable Row-Level Security
ALTER TABLE public.marketplace_playlists ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "marketplace_select"
    ON public.marketplace_playlists
    FOR SELECT
    USING (true);

CREATE POLICY "marketplace_insert"
    ON public.marketplace_playlists
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "marketplace_delete"
    ON public.marketplace_playlists
    FOR DELETE
    USING (auth.uid() = user_id);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS marketplace_playlists_user_id_idx ON public.marketplace_playlists(user_id);
CREATE INDEX IF NOT EXISTS marketplace_playlists_tags_idx ON public.marketplace_playlists USING gin(tags);
