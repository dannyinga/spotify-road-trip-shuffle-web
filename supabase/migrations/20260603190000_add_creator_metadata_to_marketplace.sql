-- Add creator_name and creator_avatar_url columns to marketplace_playlists
ALTER TABLE public.marketplace_playlists
ADD COLUMN creator_name TEXT NOT NULL DEFAULT 'Anonymous',
ADD COLUMN creator_avatar_url TEXT;
