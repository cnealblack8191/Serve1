import { Link, useRouterState } from "@tanstack/react-router";
import {
  AlertTriangle,
  PlugZap,
  Bell,
  Boxes,
  Building2,
  ChevronDown,
  ClipboardList,
  FileSpreadsheet,
  FolderOpen,
  LayoutDashboard,
  LogOut,
  Mail,
  Inbox,
  Menu,
  Plus,
  Receipt,
  Search,
  Settings,
  Smartphone,
  Users,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import eciLogo from "@/assets/eci-logo.png.asset.json";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useEci } from "@/lib/eci/store";
import { ROLES, ROLE_PRESETS, type Permission } from "@/lib/eci/types";

/**
 * "documents" is a virtual entry: anyone who can see a record can see its files.
 * "owner" is the hidden account-owner gate for sensitive setup screens (not a role).
 */
type NavPerm = Permission | "documents" | "comms" | "owner";

const DOCUMENT_PERMS: Permission[] = ["crm", "bids", "jobs", "invoices", "field"];

const NAV: { to: string; label: string; icon: typeof LayoutDashboard; perm: NavPerm }[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, perm: "dashboard" },
  { to: "/crm", label: "CRM & Opportunities", icon: Users, perm: "crm" },
  { to: "/intake", label: "Bid Intake", icon: Inbox, perm: "crm" },
  { to: "/bids", label: "Estimating & Bids", icon: FileSpreadsheet, perm: "bids" },
  { to: "/jobs", label: "Jobs & Work Orders", icon: ClipboardList, perm: "jobs" },
  { to: "/materials", label: "Materials", icon: Boxes, perm: "materials" },
  { to: "/invoices", label: "Invoices & Accounting", icon: Receipt, perm: "invoices" },
  { to: "/documents", label: "Documents", icon: FolderOpen, perm: "documents" },
  { to: "/communications", label: "Communications", icon: Mail, perm: "comms" },
  { to: "/alerts", label: "Overdue Action Items", icon: AlertTriangle, perm: "dashboard" },
  { to: "/integrations", label: "Microsoft 365", icon: PlugZap, perm: "owner" },
];

function NavList({ onNavigate }: { onNavigate?: (() => void) | undefined }) {
  const { can, isOwner, role } = useEci();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const visible = (perm: NavPerm) => {
    if (perm === "owner") return isOwner;
    if (perm === "documents") return DOCUMENT_PERMS.some((p) => can(p));
    // The shared mailbox is office correspondence, and RLS denies it to
    // technicians, so don't offer them a page that would render empty.
    if (perm === "comms") return role !== "Field" && DOCUMENT_PERMS.some((p) => can(p));
    return can(perm);
  };

  return (
    <nav className="flex-1 space-y-1 px-3">
      {NAV.filter((n) => visible(n.perm)).map((item) => {
        const active =
          item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
        const Icon = item.icon;
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-white/10 text-zinc-100"
                : "text-zinc-400 hover:text-zinc-100",
            )}
          >
            <Icon className="size-4 shrink-0" strokeWidth={1.75} />
            {item.label}
          </Link>
        );
      })}
      <div className="pt-4">
        <p className="px-3 pb-1 text-[10px] uppercase tracking-widest text-zinc-500">
          Workspace
        </p>
        {can("manage_permissions") ? (
          <Link
            to="/team"
            onClick={onNavigate}
            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-zinc-400 transition-colors hover:text-zinc-100"
          >
            <Users className="size-4 shrink-0" strokeWidth={1.75} />
            Team Management
          </Link>
        ) : null}
        {can("field") ? (
          <Link
            to="/field"
            onClick={onNavigate}
            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-zinc-400 transition-colors hover:text-zinc-100"
          >
            <Smartphone className="size-4 shrink-0" strokeWidth={1.75} />
            Field App
          </Link>
        ) : null}
        {can("manage_permissions") ? (
          <Link
            to="/settings"
            onClick={onNavigate}
            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-zinc-400 transition-colors hover:text-zinc-100"
          >
            <Settings className="size-4 shrink-0" strokeWidth={1.75} />
            Settings & Permissions
          </Link>
        ) : null}
      </div>
    </nav>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: (() => void) | undefined }) {
  const { role } = useEci();
  return (
    <div className="flex h-full flex-col bg-eci-navy">
      <div className="flex items-center gap-3 p-6">
        <img
          src={eciLogo.url}
          alt="Electrical Contractor Incorporated logo"
          width={32}
          height={32}
          className="size-8 rounded-full"
        />
        <span className="font-medium tracking-tight text-zinc-100">
          Electrical Contractor Inc.
        </span>
      </div>
      <NavList onNavigate={onNavigate} />
      <div className="border-t border-white/5 p-4">
        <div className="rounded-lg bg-white/5 p-3">
          <div className="mb-1 text-[10px] uppercase tracking-widest text-zinc-500">
            Signed in as
          </div>
          <div className="text-sm font-medium text-zinc-200">{role}</div>
        </div>
      </div>
    </div>
  );
}

function NotificationsMenu() {
  const { notifications, markNotificationsRead } = useEci();
  const unread = notifications.filter((n) => !n.read).length;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="relative grid size-9 place-items-center rounded-md ring-1 ring-black/5 hover:bg-muted"
          aria-label="Notifications"
        >
          <Bell className="size-4" strokeWidth={1.75} />
          {unread > 0 ? (
            <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-eci-amber" />
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-88 p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="text-sm font-medium">Notifications</p>
          <button
            onClick={markNotificationsRead}
            className="text-xs font-medium text-eci-copper hover:underline"
          >
            Mark all read
          </button>
        </div>
        <ul className="max-h-80 divide-y divide-border overflow-y-auto">
          {notifications.map((n) => (
            <li key={n.id} className="px-4 py-3">
              <div className="flex items-start gap-3">
                <span
                  className={cn(
                    "mt-1.5 size-2 shrink-0 rounded-full",
                    n.read ? "bg-zinc-300" : "bg-eci-amber",
                  )}
                />
                <div>
                  <p className="text-sm font-medium">
                    {n.title}
                    {n.kind === "reminder" && (
                      <span className="ml-2 rounded bg-eci-amber/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-eci-copper">
                        Reminder
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-muted-foreground">{n.detail}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{n.at}</p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { role, setRole, currentUser, session, signOut, accountRole, roleReady, hasRole } =
    useEci();
  const canManage = hasRole && ROLE_PRESETS[accountRole].includes("manage_permissions");
  const [mobileOpen, setMobileOpen] = useState(false);

  // An admin has created the account but not assigned a role yet. RLS already
  // denies every table, so render the reason rather than an app full of empty
  // screens and failed queries.
  if (roleReady && !hasRole) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="max-w-md rounded-lg border border-border p-6 text-center">
          <h1 className="text-lg font-semibold tracking-tight">Access not set up yet</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            You are signed in as {currentUser}, but no role has been assigned to this account yet.
            An ECI administrator needs to add you to the team roster before the workspace becomes
            available.
          </p>
          <Button variant="outline" className="mt-4" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 lg:block">
        <SidebarContent />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-border bg-background px-4 lg:px-8">
          <div className="flex w-full max-w-xl items-center gap-3">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation">
                  <Menu className="size-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64 border-0 p-0">
                <SidebarContent onNavigate={() => setMobileOpen(false)} />
              </SheetContent>
            </Sheet>

            <div className="relative w-full">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search jobs, invoices, or Spectrum numbers..."
                className="border-none bg-muted pl-9 ring-1 ring-black/5 focus-visible:ring-2 focus-visible:ring-eci-amber"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 lg:gap-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="hidden gap-2 xl:flex">
                  <Building2 className="size-4" />
                  ECI — Covington, GA
                  <ChevronDown className="size-3.5 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Company (placeholder)</DropdownMenuLabel>
                <DropdownMenuItem>ECI — Covington, GA</DropdownMenuItem>
                <DropdownMenuItem disabled>Add company…</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="gap-2">
                  <Plus className="size-4" />
                  <span className="hidden sm:inline">Add New</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link to="/crm/new">New opportunity</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/bids">New estimate</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/materials">Material request</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/invoices">Invoice</Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <NotificationsMenu />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 rounded-md px-1 py-1 hover:bg-muted">
                  <span className="grid size-8 place-items-center rounded-full bg-eci-navy text-xs font-semibold text-zinc-100 ring-1 ring-black/5">
                    {currentUser
                      .split(/[\s@.]+/)
                      .filter(Boolean)
                      .slice(0, 2)
                      .map((w) => w[0]?.toUpperCase())
                      .join("")}
                  </span>
                  <span className="hidden text-left leading-tight xl:block">
                    <span className="block text-sm font-medium">{currentUser}</span>
                    <span className="block text-xs text-muted-foreground">{role}</span>
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuLabel className="font-normal">
                  <span className="block text-sm font-medium">{currentUser}</span>
                  <span className="block text-xs text-muted-foreground">{session?.user.email}</span>
                </DropdownMenuLabel>
                {canManage ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel>View app as</DropdownMenuLabel>
                    {ROLES.map((r) => (
                      <DropdownMenuItem key={r} onSelect={() => setRole(r)}>
                        {r}
                        {r === role ? <span className="ml-auto text-xs text-eci-copper">Active</span> : null}
                      </DropdownMenuItem>
                    ))}
                  </>
                ) : null}
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/settings">Settings & permissions</Link>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void signOut()}>
                  <LogOut className="size-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="space-y-8 p-4 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
