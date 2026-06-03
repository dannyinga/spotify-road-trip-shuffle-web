-- Migration to create Road Trip tenant tables and collaborative shuffle structures.

-- 1. Create road_trips table
CREATE TABLE public.road_trips (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  host_id     UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  invite_code TEXT NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Create road_trip_members table
CREATE TABLE public.road_trip_members (
  trip_id               UUID NOT NULL REFERENCES public.road_trips (id) ON DELETE CASCADE,
  user_id               UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  role                  TEXT NOT NULL CHECK (role IN ('admin', 'passenger')) DEFAULT 'passenger',
  spotify_playlist_id   TEXT,
  spotify_playlist_name TEXT,
  weight                INTEGER NOT NULL DEFAULT 1 CHECK (weight >= 1 AND weight <= 10),
  joined_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (trip_id, user_id)
);

-- 3. Alter shuffle_recipes to link to road_trips (nullable for non-trip recipes)
ALTER TABLE public.shuffle_recipes
  ADD COLUMN trip_id UUID REFERENCES public.road_trips (id) ON DELETE SET NULL;

-- 4. Enable Row-Level Security
ALTER TABLE public.road_trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.road_trip_members ENABLE ROW LEVEL SECURITY;

-- 5. Helper function to check if a user is a member of a road trip
CREATE OR REPLACE FUNCTION public.is_road_trip_member(trip_id UUID, user_id UUID)
RETURNS BOOLEAN SECURITY DEFINER AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.road_trip_members
    WHERE road_trip_members.trip_id = is_road_trip_member.trip_id
      AND road_trip_members.user_id = is_road_trip_member.user_id
  );
END;
$$ LANGUAGE plpgsql;

-- 6. Trigger to automatically add the trip host as the admin member of the trip
CREATE OR REPLACE FUNCTION public.handle_new_road_trip()
RETURNS TRIGGER SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.road_trip_members (trip_id, user_id, role)
  VALUES (new.id, new.host_id, 'admin');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_road_trip_created
  AFTER INSERT ON public.road_trips
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_road_trip();

-- 7. RPC function to allow users to join a trip using an invite code
CREATE OR REPLACE FUNCTION public.join_road_trip(invite_code TEXT)
RETURNS UUID SECURITY DEFINER AS $$
DECLARE
  v_trip_id UUID;
BEGIN
  SELECT id INTO v_trip_id FROM public.road_trips WHERE road_trips.invite_code = join_road_trip.invite_code;
  IF v_trip_id IS NULL THEN
    RAISE EXCEPTION 'Invalid invite code';
  END IF;

  INSERT INTO public.road_trip_members (trip_id, user_id, role)
  VALUES (v_trip_id, auth.uid(), 'passenger')
  ON CONFLICT (trip_id, user_id) DO NOTHING;

  RETURN v_trip_id;
END;
$$ LANGUAGE plpgsql;

-- 8. Setup RLS Policies for road_trips
CREATE POLICY "road_trips_select"
  ON public.road_trips
  FOR SELECT
  USING (public.is_road_trip_member(id, auth.uid()));

CREATE POLICY "road_trips_insert"
  ON public.road_trips
  FOR INSERT
  WITH CHECK (host_id = auth.uid());

CREATE POLICY "road_trips_update"
  ON public.road_trips
  FOR UPDATE
  USING (host_id = auth.uid())
  WITH CHECK (host_id = auth.uid());

CREATE POLICY "road_trips_delete"
  ON public.road_trips
  FOR DELETE
  USING (host_id = auth.uid());

-- 9. Setup RLS Policies for road_trip_members
CREATE POLICY "road_trip_members_select"
  ON public.road_trip_members
  FOR SELECT
  USING (public.is_road_trip_member(trip_id, auth.uid()));

CREATE POLICY "road_trip_members_insert"
  ON public.road_trip_members
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid() OR 
    EXISTS (
      SELECT 1 FROM public.road_trips 
      WHERE road_trips.id = trip_id AND road_trips.host_id = auth.uid()
    )
  );

CREATE POLICY "road_trip_members_update"
  ON public.road_trip_members
  FOR UPDATE
  USING (
    user_id = auth.uid() OR 
    EXISTS (
      SELECT 1 FROM public.road_trips 
      WHERE road_trips.id = trip_id AND road_trips.host_id = auth.uid()
    )
  )
  WITH CHECK (
    user_id = auth.uid() OR 
    EXISTS (
      SELECT 1 FROM public.road_trips 
      WHERE road_trips.id = trip_id AND road_trips.host_id = auth.uid()
    )
  );

CREATE POLICY "road_trip_members_delete"
  ON public.road_trip_members
  FOR DELETE
  USING (
    user_id = auth.uid() OR 
    EXISTS (
      SELECT 1 FROM public.road_trips 
      WHERE road_trips.id = trip_id AND road_trips.host_id = auth.uid()
    )
  );

-- 10. Update shuffle_recipes policies to allow members to view recipes linked to their trips
CREATE POLICY "shuffle_recipes_select_trip"
  ON public.shuffle_recipes
  FOR SELECT
  USING (trip_id IS NOT NULL AND public.is_road_trip_member(trip_id, auth.uid()));

-- 11. Create Indexes for performance
CREATE INDEX road_trips_host_id_idx ON public.road_trips (host_id);
CREATE INDEX road_trips_invite_code_idx ON public.road_trips (invite_code);
CREATE INDEX road_trip_members_user_id_idx ON public.road_trip_members (user_id);
CREATE INDEX shuffle_recipes_trip_id_idx ON public.shuffle_recipes (trip_id);
