-- Accounts are created by admins only, so an account no longer earns access
-- merely by existing.
--
-- Previously a sign-in whose email matched no employee record fell back to the
-- 'Field' role. Field carries the 'field', 'jobs' and 'materials' permissions,
-- and the policies on jobs, work_orders, material_requests and receipts are FOR
-- ALL, so that fallback granted read, write and DELETE over every job record in
-- the company, plus read access to the entire shared mailbox via the messages
-- policies. Any account created in error inherited all of it.
--
-- Now an unmatched email is left with no row in user_roles at all.
-- has_permission() joins through user_roles, so it returns false for every
-- permission and RLS denies everything until an admin assigns a role. The
-- employee lookup runs again on each sign-in, so adding the employee row (or
-- setting the role directly) promotes the account the next time they sign in --
-- no re-registration needed.
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
      -- Bootstrap for an empty deployment: the first admin-created account.
      _role := 'Admin';
    ELSE
      SELECT e.role INTO _role FROM public.employees e WHERE lower(e.email) = _email LIMIT 1;
    END IF;
    -- Deliberately no 'Field' fallback: write a role row only when one was
    -- actually established, otherwise leave the account with no permissions.
    IF _role IS NOT NULL THEN
      INSERT INTO public.user_roles (user_id, role) VALUES (_uid, _role);
    END IF;
  END IF;
  RETURN jsonb_build_object(
    'role', _role,
    'full_name', (SELECT full_name FROM public.profiles WHERE id = _uid),
    'email', _email,
    'is_owner', public.is_owner(_uid)
  );
END;
$function$;
