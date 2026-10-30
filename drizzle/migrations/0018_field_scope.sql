-- Scope the Field role to the work actually assigned to the technician.
--
-- Every policy below previously read `has_permission(uid,'jobs') OR
-- has_permission(uid,'field')` under FOR ALL. The Field role holds 'field',
-- 'jobs' and 'materials', so a technician had SELECT, INSERT, UPDATE and
-- DELETE over every job, work order, material request and receipt in the
-- company, and the communications policies additionally let them read the
-- whole shared mailbox. The README asks for the opposite: technicians
-- restricted to their assigned jobs.
--
-- Note that 'jobs' alone cannot separate office staff from technicians,
-- because the Field role holds it too. The split is therefore made on the role
-- itself, which is unambiguous: user_roles.user_id is UNIQUE, so each account
-- has exactly one role.

/* ---------------------------------------------------------------- */
/* Identity helper                                                    */
/* ---------------------------------------------------------------- */

-- Assignment columns (work_orders.technician, material_requests.requested_by,
-- receipts.submitted_by) hold display names, not user ids, and the client
-- matches them against `profileName || email`. This returns every name the
-- account is legitimately known by so the policies can match the same way:
-- the profile's full name, its email, and the roster name of the employee
-- whose email matches. Keeping all three keeps a technician from being locked
-- out of their own work when only one of them is populated.
CREATE OR REPLACE FUNCTION public.assignment_names(_user_id uuid)
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(array_agg(DISTINCT n) FILTER (WHERE n IS NOT NULL AND n <> ''), ARRAY[]::text[])
  FROM (
    SELECT p.full_name AS n FROM public.profiles p WHERE p.id = _user_id
    UNION
    SELECT p.email     AS n FROM public.profiles p WHERE p.id = _user_id
    UNION
    SELECT e.name      AS n
      FROM public.employees e
      JOIN public.profiles p ON lower(e.email) = lower(p.email)
     WHERE p.id = _user_id
  ) s
$$;

/* ---------------------------------------------------------------- */
/* Jobs: office manages, technicians read only what they are on       */
/* ---------------------------------------------------------------- */

DROP POLICY IF EXISTS "Jobs/field access jobs" ON public.jobs;

CREATE POLICY "Office manages jobs" ON public.jobs FOR ALL TO authenticated
USING (public.has_permission(auth.uid(), 'jobs') AND NOT public.has_role(auth.uid(), 'Field'))
WITH CHECK (public.has_permission(auth.uid(), 'jobs') AND NOT public.has_role(auth.uid(), 'Field'));

CREATE POLICY "Field reads assigned jobs" ON public.jobs FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'Field')
  AND EXISTS (
    SELECT 1 FROM public.work_orders w
     WHERE w.job_id = jobs.id
       AND w.technician = ANY (public.assignment_names(auth.uid()))
  )
);

/* ---------------------------------------------------------------- */
/* Work orders: technicians read and update their own, nothing else   */
/* ---------------------------------------------------------------- */

DROP POLICY IF EXISTS "Jobs/field access work orders" ON public.work_orders;

CREATE POLICY "Office manages work orders" ON public.work_orders FOR ALL TO authenticated
USING (public.has_permission(auth.uid(), 'jobs') AND NOT public.has_role(auth.uid(), 'Field'))
WITH CHECK (public.has_permission(auth.uid(), 'jobs') AND NOT public.has_role(auth.uid(), 'Field'));

CREATE POLICY "Field reads assigned work orders" ON public.work_orders FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'Field')
  AND technician = ANY (public.assignment_names(auth.uid()))
);

-- WITH CHECK repeats the test so a technician cannot hand a work order to
-- somebody else, or pull someone else's onto themselves.
CREATE POLICY "Field updates assigned work orders" ON public.work_orders FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'Field')
  AND technician = ANY (public.assignment_names(auth.uid()))
)
WITH CHECK (
  public.has_role(auth.uid(), 'Field')
  AND technician = ANY (public.assignment_names(auth.uid()))
);

/* ---------------------------------------------------------------- */
/* Material requests: technicians raise and read their own            */
/* ---------------------------------------------------------------- */

DROP POLICY IF EXISTS "Materials/field access material requests" ON public.material_requests;

CREATE POLICY "Office manages material requests" ON public.material_requests FOR ALL TO authenticated
USING (public.has_permission(auth.uid(), 'materials') AND NOT public.has_role(auth.uid(), 'Field'))
WITH CHECK (public.has_permission(auth.uid(), 'materials') AND NOT public.has_role(auth.uid(), 'Field'));

CREATE POLICY "Field reads own material requests" ON public.material_requests FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'Field')
  AND requested_by = ANY (public.assignment_names(auth.uid()))
);

CREATE POLICY "Field raises material requests" ON public.material_requests FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'Field')
  AND requested_by = ANY (public.assignment_names(auth.uid()))
);

CREATE POLICY "Field updates own material requests" ON public.material_requests FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'Field')
  AND requested_by = ANY (public.assignment_names(auth.uid()))
)
WITH CHECK (
  public.has_role(auth.uid(), 'Field')
  AND requested_by = ANY (public.assignment_names(auth.uid()))
);

/* ---------------------------------------------------------------- */
/* Receipts: technicians submit and read their own                    */
/* ---------------------------------------------------------------- */

DROP POLICY IF EXISTS "AP/field access receipts" ON public.receipts;

CREATE POLICY "AP manages receipts" ON public.receipts FOR ALL TO authenticated
USING (public.has_permission(auth.uid(), 'ap') AND NOT public.has_role(auth.uid(), 'Field'))
WITH CHECK (public.has_permission(auth.uid(), 'ap') AND NOT public.has_role(auth.uid(), 'Field'));

CREATE POLICY "Field reads own receipts" ON public.receipts FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'Field')
  AND submitted_by = ANY (public.assignment_names(auth.uid()))
);

CREATE POLICY "Field submits receipts" ON public.receipts FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'Field')
  AND submitted_by = ANY (public.assignment_names(auth.uid()))
);

CREATE POLICY "Field updates own receipts" ON public.receipts FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'Field')
  AND submitted_by = ANY (public.assignment_names(auth.uid()))
)
WITH CHECK (
  public.has_role(auth.uid(), 'Field')
  AND submitted_by = ANY (public.assignment_names(auth.uid()))
);

/* ---------------------------------------------------------------- */
/* Communications: the shared mailbox is office correspondence         */
/* ---------------------------------------------------------------- */

-- 'field' is dropped from the disjunction and the role is excluded outright,
-- because the Field role also holds 'jobs' and would otherwise still match.
DROP POLICY IF EXISTS "Team reads threads" ON public.message_threads;
CREATE POLICY "Team reads threads" ON public.message_threads FOR SELECT TO authenticated
USING (
  NOT public.has_role(auth.uid(), 'Field')
  AND (
    public.has_permission(auth.uid(), 'crm') OR public.has_permission(auth.uid(), 'bids')
    OR public.has_permission(auth.uid(), 'jobs') OR public.has_permission(auth.uid(), 'invoices')
  )
);

DROP POLICY IF EXISTS "Team writes threads" ON public.message_threads;
CREATE POLICY "Team writes threads" ON public.message_threads FOR INSERT TO authenticated
WITH CHECK (
  NOT public.has_role(auth.uid(), 'Field')
  AND (
    public.has_permission(auth.uid(), 'crm') OR public.has_permission(auth.uid(), 'bids')
    OR public.has_permission(auth.uid(), 'jobs') OR public.has_permission(auth.uid(), 'invoices')
  )
);

DROP POLICY IF EXISTS "Team updates threads" ON public.message_threads;
CREATE POLICY "Team updates threads" ON public.message_threads FOR UPDATE TO authenticated
USING (
  NOT public.has_role(auth.uid(), 'Field')
  AND (
    public.has_permission(auth.uid(), 'crm') OR public.has_permission(auth.uid(), 'bids')
    OR public.has_permission(auth.uid(), 'jobs') OR public.has_permission(auth.uid(), 'invoices')
  )
)
WITH CHECK (
  NOT public.has_role(auth.uid(), 'Field')
  AND (
    public.has_permission(auth.uid(), 'crm') OR public.has_permission(auth.uid(), 'bids')
    OR public.has_permission(auth.uid(), 'jobs') OR public.has_permission(auth.uid(), 'invoices')
  )
);

DROP POLICY IF EXISTS "Team reads messages" ON public.messages;
CREATE POLICY "Team reads messages" ON public.messages FOR SELECT TO authenticated
USING (
  NOT public.has_role(auth.uid(), 'Field')
  AND (
    public.has_permission(auth.uid(), 'crm') OR public.has_permission(auth.uid(), 'bids')
    OR public.has_permission(auth.uid(), 'jobs') OR public.has_permission(auth.uid(), 'invoices')
  )
);

DROP POLICY IF EXISTS "Team writes messages" ON public.messages;
CREATE POLICY "Team writes messages" ON public.messages FOR INSERT TO authenticated
WITH CHECK (
  NOT public.has_role(auth.uid(), 'Field')
  AND (
    public.has_permission(auth.uid(), 'crm') OR public.has_permission(auth.uid(), 'bids')
    OR public.has_permission(auth.uid(), 'jobs') OR public.has_permission(auth.uid(), 'invoices')
  )
);

DROP POLICY IF EXISTS "Team updates messages" ON public.messages;
CREATE POLICY "Team updates messages" ON public.messages FOR UPDATE TO authenticated
USING (
  NOT public.has_role(auth.uid(), 'Field')
  AND (
    public.has_permission(auth.uid(), 'crm') OR public.has_permission(auth.uid(), 'bids')
    OR public.has_permission(auth.uid(), 'jobs') OR public.has_permission(auth.uid(), 'invoices')
  )
)
WITH CHECK (
  NOT public.has_role(auth.uid(), 'Field')
  AND (
    public.has_permission(auth.uid(), 'crm') OR public.has_permission(auth.uid(), 'bids')
    OR public.has_permission(auth.uid(), 'jobs') OR public.has_permission(auth.uid(), 'invoices')
  )
);

DROP POLICY IF EXISTS "Team reads message links" ON public.message_links;
CREATE POLICY "Team reads message links" ON public.message_links FOR SELECT TO authenticated
USING (
  NOT public.has_role(auth.uid(), 'Field')
  AND (
    public.has_permission(auth.uid(), 'crm') OR public.has_permission(auth.uid(), 'bids')
    OR public.has_permission(auth.uid(), 'jobs') OR public.has_permission(auth.uid(), 'invoices')
  )
);

DROP POLICY IF EXISTS "Team writes message links" ON public.message_links;
CREATE POLICY "Team writes message links" ON public.message_links FOR INSERT TO authenticated
WITH CHECK (
  NOT public.has_role(auth.uid(), 'Field')
  AND (
    public.has_permission(auth.uid(), 'crm') OR public.has_permission(auth.uid(), 'bids')
    OR public.has_permission(auth.uid(), 'jobs') OR public.has_permission(auth.uid(), 'invoices')
  )
);

DROP POLICY IF EXISTS "Team removes message links" ON public.message_links;
CREATE POLICY "Team removes message links" ON public.message_links FOR DELETE TO authenticated
USING (
  NOT public.has_role(auth.uid(), 'Field')
  AND (
    public.has_permission(auth.uid(), 'crm') OR public.has_permission(auth.uid(), 'bids')
    OR public.has_permission(auth.uid(), 'jobs') OR public.has_permission(auth.uid(), 'invoices')
  )
);

DROP POLICY IF EXISTS "Team reads attachments" ON public.message_attachments;
CREATE POLICY "Team reads attachments" ON public.message_attachments FOR SELECT TO authenticated
USING (
  NOT public.has_role(auth.uid(), 'Field')
  AND (
    public.has_permission(auth.uid(), 'crm') OR public.has_permission(auth.uid(), 'bids')
    OR public.has_permission(auth.uid(), 'jobs') OR public.has_permission(auth.uid(), 'invoices')
  )
);

DROP POLICY IF EXISTS "Team writes attachments" ON public.message_attachments;
CREATE POLICY "Team writes attachments" ON public.message_attachments FOR INSERT TO authenticated
WITH CHECK (
  NOT public.has_role(auth.uid(), 'Field')
  AND (
    public.has_permission(auth.uid(), 'crm') OR public.has_permission(auth.uid(), 'bids')
    OR public.has_permission(auth.uid(), 'jobs') OR public.has_permission(auth.uid(), 'invoices')
  )
);

DROP POLICY IF EXISTS "Team removes attachments" ON public.message_attachments;
CREATE POLICY "Team removes attachments" ON public.message_attachments FOR DELETE TO authenticated
USING (
  NOT public.has_role(auth.uid(), 'Field')
  AND (
    public.has_permission(auth.uid(), 'crm') OR public.has_permission(auth.uid(), 'bids')
    OR public.has_permission(auth.uid(), 'jobs') OR public.has_permission(auth.uid(), 'invoices')
  )
);

DROP POLICY IF EXISTS "Team reads sync state" ON public.mailbox_sync_state;
CREATE POLICY "Team reads sync state" ON public.mailbox_sync_state FOR SELECT TO authenticated
USING (
  NOT public.has_role(auth.uid(), 'Field')
  AND (
    public.has_permission(auth.uid(), 'crm') OR public.has_permission(auth.uid(), 'bids')
    OR public.has_permission(auth.uid(), 'jobs') OR public.has_permission(auth.uid(), 'invoices')
  )
);
