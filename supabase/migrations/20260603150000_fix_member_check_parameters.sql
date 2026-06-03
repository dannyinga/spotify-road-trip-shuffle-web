-- Drop dependent policies first, then recreate the check function to avoid naming collisions, and restore the policies.

-- 1. Drop dependent policies
DROP POLICY IF EXISTS "road_trips_select" ON public.road_trips;
DROP POLICY IF EXISTS "road_trip_members_select" ON public.road_trip_members;
DROP POLICY IF EXISTS "shuffle_recipes_select_trip" ON public.shuffle_recipes;

-- 2. Drop old function
DROP FUNCTION IF EXISTS public.is_road_trip_member(UUID, UUID);

-- 3. Create new function with corrected parameters
CREATE OR REPLACE FUNCTION public.is_road_trip_member(p_trip_id UUID, p_user_id UUID)
RETURNS BOOLEAN SECURITY DEFINER AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.road_trip_members
    WHERE road_trip_members.trip_id = p_trip_id
      AND road_trip_members.user_id = p_user_id
  );
END;
$$ LANGUAGE plpgsql;

-- 4. Recreate policies
CREATE POLICY "road_trips_select"
  ON public.road_trips
  FOR SELECT
  USING (public.is_road_trip_member(id, auth.uid()));

CREATE POLICY "road_trip_members_select"
  ON public.road_trip_members
  FOR SELECT
  USING (public.is_road_trip_member(trip_id, auth.uid()));

CREATE POLICY "shuffle_recipes_select_trip"
  ON public.shuffle_recipes
  FOR SELECT
  USING (trip_id IS NOT NULL AND public.is_road_trip_member(trip_id, auth.uid()));
