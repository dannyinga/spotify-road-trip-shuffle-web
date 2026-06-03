-- Drop the existing select policy
DROP POLICY IF EXISTS "road_trips_select" ON public.road_trips;

-- Recreate the select policy to allow access if the user is the host OR a member.
-- This ensures the host can read the row during the INSERT ... RETURNING statement
-- before the AFTER INSERT trigger has finished creating the membership record.
CREATE POLICY "road_trips_select"
  ON public.road_trips
  FOR SELECT
  USING (host_id = auth.uid() OR public.is_road_trip_member(id, auth.uid()));
