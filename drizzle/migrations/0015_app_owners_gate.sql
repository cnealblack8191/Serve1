CREATE TABLE IF NOT EXISTS public.app_owners (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.app_owners TO authenticated;
GRANT ALL ON public.app_owners TO service_role;

ALTER TABLE public.app_owners ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners readable by signed-in users" ON public.app_owners;
CREATE POLICY "Owners readable by signed-in users"
ON public.app_owners FOR SELECT TO authenticated
USING (true);

CREATE OR REPLACE FUNCTION public.is_owner(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.app_owners WHERE user_id = _user_id)
$$;

INSERT INTO public.app_owners (user_id, note)
VALUES ('534b1b34-150a-4b41-9eb8-1940217a56c6', 'Primary account owner')
ON CONFLICT (user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.ensure_profile()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  _name text := coalesce(auth.jwt() -> 'user_metadata' ->> 'full_name', '');
  _role public.app_role;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  INSERT INTO public.profiles (id, email, full_name) VALUES (_uid, _email, NULLIF(_name, ''))
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, full_name = coalesce(public.profiles.full_name, EXCLUDED.full_name);
  SELECT role INTO _role FROM public.user_roles WHERE user_id = _uid;
  IF _role IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.user_roles) THEN
      _role := 'Admin';
    ELSE
      SELECT e.role INTO _role FROM public.employees e WHERE lower(e.email) = _email LIMIT 1;
      _role := coalesce(_role, 'Field');
    END IF;
    INSERT INTO public.user_roles (user_id, role) VALUES (_uid, _role);
  END IF;
  RETURN jsonb_build_object(
    'role', _role,
    'full_name', (SELECT full_name FROM public.profiles WHERE id = _uid),
    'email', _email,
    'is_owner', public.is_owner(_uid)
  );
END;
$function$;