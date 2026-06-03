-- Create helper function to query road trip members with display names and avatars from auth.users.
-- Since auth.users is protected, this function runs with SECURITY DEFINER privileges.

CREATE OR REPLACE FUNCTION public.get_road_trip_members(p_trip_id UUID)
RETURNS TABLE (
  user_id UUID,
  role TEXT,
  spotify_playlist_id TEXT,
  spotify_playlist_name TEXT,
  weight INTEGER,
  joined_at TIMESTAMPTZ,
  display_name TEXT,
  avatar_url TEXT
) SECURITY DEFINER AS $$
BEGIN
  -- Check if the calling user is a member of this trip
  IF NOT EXISTS (
    SELECT 1 FROM public.road_trip_members
    WHERE road_trip_members.trip_id = p_trip_id
      AND road_trip_members.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Access Denied: You are not a member of this road trip.';
  END IF;

  RETURN QUERY
  SELECT
    m.user_id,
    m.role,
    m.spotify_playlist_id,
    m.spotify_playlist_name,
    m.weight,
    m.joined_at,
    COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', u.email, 'Anonymous') AS display_name,
    u.raw_user_meta_data->>'avatar_url' AS avatar_url
  FROM public.road_trip_members m
  JOIN auth.users u ON m.user_id = u.id
  WHERE m.trip_id = p_trip_id
  ORDER BY m.role DESC, m.joined_at ASC;
END;
$$ LANGUAGE plpgsql;
