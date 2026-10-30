import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  CalendarRange,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Receipt,
  Smartphone,
  Sun,
  Users,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { signOut, useCurrentUser, useDataChangeRefresh, type Role } from "@/data";
import { applyTheme, readTheme, resolveTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

/**
 * Navigation by role (SPEC.md sections 2 and 13).
 * Office (web): Dashboard, Customers, Jobs, Dispatch, Invoices. Tech (phone): Today.
 */
const NAV: { to: string; label: string; icon: typeof LayoutDashboard; roles: Role[] }[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, roles: ["Admin", "Office", "Owner"] },
  { to: "/customers", label: "Customers", icon: Users, roles: ["Admin", "Office", "Owner"] },
  { to: "/jobs", label: "Jobs", icon: ClipboardList, roles: ["Admin", "Office", "Owner"] },
  { to: "/dispatch", label: "Dispatch", icon: CalendarRange, roles: ["Admin", "Office"] },
  { to: "/invoices", label: "Invoices", icon: Receipt, roles: ["Admin", "Office", "Owner"] },
  { to: "/tech", label: "Today", icon: Smartphone, roles: ["Admin", "Office", "Tech"] },
];

export const navFor = (role: Role) => NAV.filter((n) => n.roles.includes(role));

function NavList({
  role,
  onNavigate,
  variant,
}: {
  role: Role;
  onNavigate?: () => void;
  variant: "sidebar" | "tabs";
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const items = navFor(role);
  if (variant === "tabs") {
    return (
      <nav
        className="fixed inset-x-0 bottom-0 z-20 grid border-t border-border bg-background pb-[env(safe-area-inset-bottom)]"
        style={{ gridTemplateColumns: `repeat(${items.length}, 1fr)` }}
        aria-label="Main"
      >
        {items.map((item) => {
          const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              className={cn(
                "flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              <Icon className="size-5" strokeWidth={1.75} />
              {item.label}
            </Link>
          );
        })}
      </nav>
    );
  }
  return (
    <nav className="flex-1 space-y-1 px-3" aria-label="Main">
      {items.map((item) => {
        const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
        const Icon = item.icon;
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active ? "bg-white/10 text-zinc-100" : "text-zinc-400 hover:text-zinc-100",
            )}
          >
            <Icon className="size-4 shrink-0" strokeWidth={1.75} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function Sidebar({
  role,
  name,
  onNavigate,
}: {
  role: Role;
  name: string;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex h-full flex-col bg-eci-navy">
      <div className="flex items-center gap-3 p-6">
        <img
          src="/logo.png"
          alt="Company logo"
          width={32}
          height={32}
          className="size-8 rounded-full"
        />
        <span className="font-medium tracking-tight text-zinc-100">Serv1</span>
      </div>
      <NavList role={role} onNavigate={onNavigate} variant="sidebar" />
      <div className="border-t border-white/5 p-4">
        <div className="rounded-lg bg-white/5 p-3">
          <div className="mb-1 text-[10px] uppercase tracking-widest text-zinc-500">
            Signed in as
          </div>
          <div className="text-sm font-medium text-zinc-200">{name}</div>
          <div className="text-xs text-zinc-400">{role}</div>
        </div>
      </div>
    </div>
  );
}

function ThemeToggle() {
  const [theme, setTheme] = useState(() => resolveTheme(readTheme()));
  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    applyTheme(next);
    setTheme(next);
  };
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
    >
      {theme === "dark" ? <Sun className="size-5" /> : <Moon className="size-5" />}
    </Button>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  useDataChangeRefresh();
  const { data: me } = useCurrentUser();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (!me) return null; // the route guard already redirected
  const role = me.role;
  const techLayout = role === "Tech";

  const doSignOut = async () => {
    await signOut();
    qc.clear();
    void navigate({ to: "/auth", replace: true });
  };

  const initials = me.name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

  const userMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex items-center gap-2 rounded-md px-1 py-1 hover:bg-muted"
          aria-label="Account menu"
        >
          <span className="grid size-9 place-items-center rounded-full bg-eci-navy text-xs font-semibold text-zinc-100 ring-1 ring-black/5">
            {initials}
          </span>
          <span className="hidden text-left leading-tight xl:block">
            <span className="block text-sm font-medium">{me.name}</span>
            <span className="block text-xs text-muted-foreground">{role}</span>
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <span className="block text-sm font-medium">{me.name}</span>
          <span className="block text-xs text-muted-foreground">{me.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void doSignOut()}>
          <LogOut className="size-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  if (techLayout) {
    // Phone layout (SPEC.md section 13): header, content, bottom tabs, big targets.
    return (
      <div className="flex min-h-screen flex-col bg-background text-foreground">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-background px-4">
          <div className="flex items-center gap-2">
            <img
              src="/logo.png"
              alt="Company logo"
              width={28}
              height={28}
              className="size-7 rounded-full"
            />
            <span className="font-semibold tracking-tight">Serv1</span>
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            {userMenu}
          </div>
        </header>
        <main className="flex-1 space-y-4 p-4 pb-20">{children}</main>
        <NavList role={role} variant="tabs" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 bg-eci-navy lg:block">
        <Sidebar role={role} name={me.name} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-border bg-background px-4 lg:px-8">
          <div className="flex items-center gap-3">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="lg:hidden"
                  aria-label="Open navigation"
                >
                  <Menu className="size-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64 border-0 p-0">
                <Sidebar role={role} name={me.name} onNavigate={() => setMobileOpen(false)} />
              </SheetContent>
            </Sheet>
            <span className="text-sm text-muted-foreground lg:hidden">Serv1</span>
          </div>
          <div className="flex items-center gap-2 lg:gap-3">
            {role !== "Owner" ? (
              <Button asChild className="gap-2">
                <Link to="/jobs/new">New Job</Link>
              </Button>
            ) : null}
            <ThemeToggle />
            {userMenu}
          </div>
        </header>
        <main className="space-y-8 p-4 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
