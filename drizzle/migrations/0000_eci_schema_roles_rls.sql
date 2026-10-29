-- Roles & permissions
CREATE TYPE public.app_role AS ENUM ('Admin','Division Manager','Service Manager','Coordinator','AP/AR','Field');
CREATE TYPE public.app_permission AS ENUM ('dashboard','crm','bids','jobs','materials','invoices','ap','approve_quotes','send_email','manage_permissions','field');

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  email text,
  full_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.role_permissions (
  role public.app_role NOT NULL,
  permission public.app_permission NOT NULL,
  PRIMARY KEY (role, permission)
);
GRANT SELECT ON public.role_permissions TO authenticated;
GRANT ALL ON public.role_permissions TO service_role;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read role permissions" ON public.role_permissions FOR SELECT TO authenticated USING (true);

INSERT INTO public.role_permissions (role, permission) VALUES
 ('Admin','dashboard'),('Admin','crm'),('Admin','bids'),('Admin','jobs'),('Admin','materials'),('Admin','invoices'),('Admin','ap'),('Admin','approve_quotes'),('Admin','send_email'),('Admin','manage_permissions'),('Admin','field'),
 ('Division Manager','dashboard'),('Division Manager','crm'),('Division Manager','bids'),('Division Manager','jobs'),('Division Manager','materials'),('Division Manager','invoices'),('Division Manager','ap'),('Division Manager','approve_quotes'),('Division Manager','send_email'),('Division Manager','manage_permissions'),('Division Manager','field'),
 ('Service Manager','dashboard'),('Service Manager','crm'),('Service Manager','bids'),('Service Manager','jobs'),('Service Manager','materials'),('Service Manager','invoices'),('Service Manager','send_email'),
 ('Coordinator','crm'),('Coordinator','bids'),('Coordinator','jobs'),('Coordinator','materials'),('Coordinator','invoices'),('Coordinator','send_email'),
 ('AP/AR','dashboard'),('AP/AR','jobs'),('AP/AR','materials'),('AP/AR','invoices'),('AP/AR','ap'),('AP/AR','send_email'),
 ('Field','field'),('Field','jobs'),('Field','materials');

CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _perm public.app_permission)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.role_permissions rp ON rp.role = ur.role
    WHERE ur.user_id = _user_id AND rp.permission = _perm
  )
$$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "Users read own profile" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid() OR public.has_permission(auth.uid(), 'manage_permissions'));
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "Users read own role" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_permission(auth.uid(), 'manage_permissions'));
CREATE POLICY "Managers assign roles" ON public.user_roles FOR UPDATE TO authenticated USING (public.has_permission(auth.uid(), 'manage_permissions')) WITH CHECK (public.has_permission(auth.uid(), 'manage_permissions'));

-- Business tables
CREATE TABLE public.employees (
  id text PRIMARY KEY, name text NOT NULL, role public.app_role NOT NULL DEFAULT 'Field',
  phone text NOT NULL DEFAULT '', email text NOT NULL DEFAULT '', active boolean NOT NULL DEFAULT true,
  added_at text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.customers (
  id text PRIMARY KEY, name text NOT NULL UNIQUE, billing_address text NOT NULL DEFAULT '',
  contact_email text NOT NULL DEFAULT '', contact_phone text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.opportunities (
  id text PRIMARY KEY, name text NOT NULL, customer text NOT NULL DEFAULT '', contact_name text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '', job_type text NOT NULL DEFAULT '', division text NOT NULL DEFAULT '',
  expected_bid_date text NOT NULL DEFAULT '', description text NOT NULL DEFAULT '', notes text NOT NULL DEFAULT '',
  assigned_to text NOT NULL DEFAULT '', value numeric NOT NULL DEFAULT 0, stage text NOT NULL DEFAULT 'New Opportunity',
  contacts jsonb NOT NULL DEFAULT '[]', documents jsonb NOT NULL DEFAULT '[]', activity jsonb NOT NULL DEFAULT '[]',
  bid_id text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.bids (
  id text PRIMARY KEY, opportunity_id text NOT NULL DEFAULT '', name text NOT NULL, customer text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '', division text NOT NULL DEFAULT '', job_type text NOT NULL DEFAULT '',
  owner text NOT NULL DEFAULT '', stage text NOT NULL DEFAULT 'Estimating', approval_group text NOT NULL DEFAULT 'Standard Approval Group',
  pdf_generated boolean NOT NULL DEFAULT false, sent_at text, activity jsonb NOT NULL DEFAULT '[]', job_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.line_items (
  id text PRIMARY KEY, bid_id text NOT NULL REFERENCES public.bids(id) ON DELETE CASCADE, position integer NOT NULL DEFAULT 0,
  cost_code text NOT NULL DEFAULT '', category text NOT NULL DEFAULT 'Labor', description text NOT NULL DEFAULT '',
  customer_description text NOT NULL DEFAULT '', qty numeric NOT NULL DEFAULT 1, unit text NOT NULL DEFAULT 'EA',
  unit_cost numeric NOT NULL DEFAULT 0, markup numeric NOT NULL DEFAULT 0, internal_note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.approval_records (
  id text PRIMARY KEY, bid_id text NOT NULL REFERENCES public.bids(id) ON DELETE CASCADE, approver text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT '', status text NOT NULL DEFAULT 'Pending', comment text, at text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.jobs (
  id text PRIMARY KEY, name text NOT NULL, phase text NOT NULL DEFAULT '', customer text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '', status text NOT NULL DEFAULT 'Active', division text NOT NULL DEFAULT '',
  manager text NOT NULL DEFAULT '', spectrum_number text NOT NULL DEFAULT 'pending', contract_value numeric NOT NULL DEFAULT 0,
  contacts jsonb NOT NULL DEFAULT '[]', documents jsonb NOT NULL DEFAULT '[]', activity jsonb NOT NULL DEFAULT '[]',
  bid_id text, spectrum_sync text NOT NULL DEFAULT 'Not Connected', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.work_orders (
  id text PRIMARY KEY, number text NOT NULL DEFAULT '', job_id text NOT NULL DEFAULT '', title text NOT NULL DEFAULT '',
  technician text NOT NULL DEFAULT '', priority text NOT NULL DEFAULT 'Priority 2', status text NOT NULL DEFAULT 'Scheduled',
  scheduled text NOT NULL DEFAULT '', tasks jsonb NOT NULL DEFAULT '[]', notes jsonb NOT NULL DEFAULT '[]',
  description text, site_contact text, site_contact_phone text, arrival text, photos jsonb, completion jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.material_requests (
  id text PRIMARY KEY, job_id text NOT NULL DEFAULT '', job_name text NOT NULL DEFAULT '', work_order text NOT NULL DEFAULT '',
  item text NOT NULL DEFAULT '', qty text NOT NULL DEFAULT '', requested_by text NOT NULL DEFAULT '', requested_at text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'Requested', po_number text, notes text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.invoices (
  id text PRIMARY KEY, number text NOT NULL DEFAULT '', job_id text NOT NULL DEFAULT '', job_name text NOT NULL DEFAULT '',
  customer text NOT NULL DEFAULT '', amount numeric NOT NULL DEFAULT 0, balance numeric NOT NULL DEFAULT 0,
  issued text NOT NULL DEFAULT '', due text NOT NULL DEFAULT '', status text NOT NULL DEFAULT 'Draft',
  notes jsonb NOT NULL DEFAULT '[]', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.receipts (
  id text PRIMARY KEY, vendor text NOT NULL DEFAULT '', amount numeric NOT NULL DEFAULT 0, job_id text NOT NULL DEFAULT '',
  job_name text NOT NULL DEFAULT '', work_order text NOT NULL DEFAULT '', submitted_by text NOT NULL DEFAULT '', at text NOT NULL DEFAULT '',
  po_number text, matched boolean NOT NULL DEFAULT false, missing_docs boolean NOT NULL DEFAULT false, complete boolean NOT NULL DEFAULT false,
  notes jsonb NOT NULL DEFAULT '[]', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.email_records (
  id text PRIMARY KEY, recipient text NOT NULL DEFAULT '', subject text NOT NULL DEFAULT '', body text NOT NULL DEFAULT '',
  attachments jsonb NOT NULL DEFAULT '[]', at text NOT NULL DEFAULT '', record_id text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.notifications (
  id text PRIMARY KEY, title text NOT NULL DEFAULT '', detail text NOT NULL DEFAULT '', at text NOT NULL DEFAULT '',
  read boolean NOT NULL DEFAULT false, kind text NOT NULL DEFAULT 'stage', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.reminders (
  id text PRIMARY KEY, record_id text NOT NULL DEFAULT '', title text NOT NULL DEFAULT '', due text NOT NULL DEFAULT '',
  assigned_to text NOT NULL DEFAULT '', note text NOT NULL DEFAULT '', done boolean NOT NULL DEFAULT false,
  created_at_label text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.employees, public.customers, public.opportunities, public.bids, public.line_items,
  public.approval_records, public.jobs, public.work_orders, public.material_requests, public.invoices, public.receipts,
  public.email_records, public.notifications, public.reminders TO authenticated;
GRANT ALL ON public.employees, public.customers, public.opportunities, public.bids, public.line_items,
  public.approval_records, public.jobs, public.work_orders, public.material_requests, public.invoices, public.receipts,
  public.email_records, public.notifications, public.reminders TO service_role;

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bids ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;

-- Permission-scoped policies
CREATE POLICY "Team reads employees" ON public.employees FOR SELECT TO authenticated USING (true);
CREATE POLICY "Managers write employees" ON public.employees FOR INSERT TO authenticated WITH CHECK (public.has_permission(auth.uid(), 'manage_permissions'));
CREATE POLICY "Managers update employees" ON public.employees FOR UPDATE TO authenticated USING (public.has_permission(auth.uid(), 'manage_permissions'));
CREATE POLICY "Managers delete employees" ON public.employees FOR DELETE TO authenticated USING (public.has_permission(auth.uid(), 'manage_permissions'));

CREATE POLICY "CRM/bids access customers" ON public.customers FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), 'crm') OR public.has_permission(auth.uid(), 'bids'))
  WITH CHECK (public.has_permission(auth.uid(), 'crm') OR public.has_permission(auth.uid(), 'bids'));
CREATE POLICY "CRM access opportunities" ON public.opportunities FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), 'crm')) WITH CHECK (public.has_permission(auth.uid(), 'crm'));
CREATE POLICY "CRM access reminders" ON public.reminders FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), 'crm')) WITH CHECK (public.has_permission(auth.uid(), 'crm'));
CREATE POLICY "Bids access bids" ON public.bids FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), 'bids')) WITH CHECK (public.has_permission(auth.uid(), 'bids'));
CREATE POLICY "Bids access line items" ON public.line_items FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), 'bids')) WITH CHECK (public.has_permission(auth.uid(), 'bids'));
CREATE POLICY "Bids/approvers access approvals" ON public.approval_records FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), 'bids') OR public.has_permission(auth.uid(), 'approve_quotes'))
  WITH CHECK (public.has_permission(auth.uid(), 'bids') OR public.has_permission(auth.uid(), 'approve_quotes'));
CREATE POLICY "Jobs/field access jobs" ON public.jobs FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), 'jobs') OR public.has_permission(auth.uid(), 'field'))
  WITH CHECK (public.has_permission(auth.uid(), 'jobs') OR public.has_permission(auth.uid(), 'field'));
CREATE POLICY "Jobs/field access work orders" ON public.work_orders FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), 'jobs') OR public.has_permission(auth.uid(), 'field'))
  WITH CHECK (public.has_permission(auth.uid(), 'jobs') OR public.has_permission(auth.uid(), 'field'));
CREATE POLICY "Materials/field access material requests" ON public.material_requests FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), 'materials') OR public.has_permission(auth.uid(), 'field'))
  WITH CHECK (public.has_permission(auth.uid(), 'materials') OR public.has_permission(auth.uid(), 'field'));
CREATE POLICY "Invoices access invoices" ON public.invoices FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), 'invoices')) WITH CHECK (public.has_permission(auth.uid(), 'invoices'));
CREATE POLICY "AP/field access receipts" ON public.receipts FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), 'ap') OR public.has_permission(auth.uid(), 'field'))
  WITH CHECK (public.has_permission(auth.uid(), 'ap') OR public.has_permission(auth.uid(), 'field'));
CREATE POLICY "Email senders access email records" ON public.email_records FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), 'send_email')) WITH CHECK (public.has_permission(auth.uid(), 'send_email'));
CREATE POLICY "Team accesses notifications" ON public.notifications FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Profile bootstrap: called by the app after sign-in. First user becomes Admin; otherwise
-- the role comes from the matching employee record, else Field.
CREATE OR REPLACE FUNCTION public.ensure_profile()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
  RETURN jsonb_build_object('role', _role, 'full_name', (SELECT full_name FROM public.profiles WHERE id = _uid), 'email', _email);
END;
$$;
GRANT EXECUTE ON FUNCTION public.ensure_profile() TO authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE public.employees, public.customers, public.opportunities, public.bids,
  public.line_items, public.approval_records, public.jobs, public.work_orders, public.material_requests, public.invoices,
  public.receipts, public.email_records, public.notifications, public.reminders;