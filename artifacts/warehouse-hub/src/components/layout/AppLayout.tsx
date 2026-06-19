import { useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Package,
  Calendar,
  CalendarRange,
  AlertTriangle,
  History,
  Workflow,
  Users,
  LogOut,
  RefreshCw,
  Menu,
  ClipboardList,
  Truck,
} from "lucide-react";
import { 
  useGetCurrentUser, 
  useLogoutUser,
  useGetDashboardOverview
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { data: session } = useGetCurrentUser();
  const logout = useLogoutUser();
  const queryClient = useQueryClient();
  const { data: dashboard } = useGetDashboardOverview();

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => {
        queryClient.clear();
        window.location.href = `${import.meta.env.BASE_URL}login`;
      }
    });
  };

  const navItems = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/inventory", label: "Inventory", icon: Package },
    { href: "/quarterly", label: "Quarterly Board", icon: Calendar },
    { href: "/capacity", label: "Capacity Planner", icon: CalendarRange },
    { href: "/shipments", label: "Shipments", icon: Truck },
    { href: "/run-sheet", label: "Run Sheet", icon: ClipboardList },
    { href: "/exceptions", label: "Exceptions", icon: AlertTriangle },
    { href: "/audit", label: "Audit Log", icon: History },
    { href: "/integrations", label: "Integrations", icon: Workflow },
    { href: "/directory", label: "Directory", icon: Users },
  ];

  const user = session?.user;

  const SidebarContent = () => (
    <div className="flex h-full flex-col gap-4">
      <div className="flex h-14 items-center px-4 font-bold text-lg tracking-tight border-b">
        <Package className="mr-2 h-5 w-5 text-primary" />
        Shoebill AI
      </div>
      <div className="flex-1 overflow-auto py-2">
        <nav className="grid gap-1 px-2">
          {navItems.map((item) => {
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
            return (
              <Link key={item.href} href={item.href}>
                <div
                  className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer ${
                    isActive ? "bg-accent text-accent-foreground" : "text-muted-foreground"
                  }`}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </div>
              </Link>
            );
          })}
        </nav>
      </div>
      <div className="mt-auto border-t p-4">
        {user && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col">
              <span className="text-sm font-medium leading-none">{user.displayName}</span>
              <span className="text-xs text-muted-foreground mt-1 capitalize">{user.role.replace("_", " ")}</span>
            </div>
            <Button variant="outline" className="w-full justify-start" onClick={handleLogout}>
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </Button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="grid min-h-screen w-full md:grid-cols-[240px_1fr] lg:grid-cols-[280px_1fr]">
      <div className="hidden border-r bg-muted/40 md:block">
        <SidebarContent />
      </div>
      <div className="flex flex-col">
        <header className="flex h-14 items-center gap-4 border-b bg-background px-4 lg:px-6">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" className="shrink-0 md:hidden">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Toggle navigation menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="flex flex-col p-0 w-72">
              <SidebarContent />
            </SheetContent>
          </Sheet>
          <div className="w-full flex-1 flex justify-between items-center">
            <div className="flex items-center gap-4">
              {user && (
                <div className="hidden sm:flex items-center gap-2">
                  <Badge variant="secondary" className="font-normal capitalize">
                    {user.role.replace("_", " ")}
                  </Badge>
                  {(user.clientId || user.supplierId || user.warehouseId) && (
                    <span className="text-sm text-muted-foreground border-l pl-4 ml-2">
                      Viewing restricted scope
                    </span>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center gap-4">
              {dashboard?.lastSync && (
                <div className="flex items-center text-xs text-muted-foreground gap-1.5 hidden sm:flex" title="Last successful integration sync">
                  <RefreshCw className="h-3 w-3" />
                  <span>Synced {new Date(dashboard.lastSync).toLocaleTimeString()}</span>
                </div>
              )}
            </div>
          </div>
        </header>
        <main className="flex flex-1 flex-col gap-4 p-4 lg:gap-6 lg:p-6 bg-muted/20">
          {children}
        </main>
      </div>
    </div>
  );
}
