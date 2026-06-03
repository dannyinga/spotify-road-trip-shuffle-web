-- Debug function to check the authenticated user and role in the database context.
CREATE OR REPLACE FUNCTION public.get_my_uid()
RETURNS TABLE (uid UUID, role TEXT) SECURITY INVOKER AS $$
BEGIN
  RETURN QUERY SELECT auth.uid(), auth.role();
END;
$$ LANGUAGE plpgsql;
