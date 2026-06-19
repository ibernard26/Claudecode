import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useGetCurrentUser } from "@workspace/api-client-react";

import { AppLayout } from "@/components/layout/AppLayout";
import NotFound from "@/pages/not-found";
import Login from "@/pages/Login";

import Dashboard from "@/pages/Dashboard";
import Inventory from "@/pages/Inventory";
import InventoryDetail from "@/pages/InventoryDetail";
import QuarterlyBoard from "@/pages/QuarterlyBoard";
import Capacity from "@/pages/Capacity";
import Manifest from "@/pages/Manifest";
import RunSheet from "@/pages/RunSheet";
import Exceptions from "@/pages/Exceptions";
import AuditLog from "@/pages/AuditLog";
import Integrations from "@/pages/Integrations";
import Directory from "@/pages/Directory";
import Shipments from "@/pages/Shipments";
import NewShipment from "@/pages/NewShipment";

const queryClient = new QueryClient();

function ProtectedRoutes() {
  const { data: session, isLoading } = useGetCurrentUser();

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  if (!session?.user) {
    return <Login />;
  }

  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/inventory" component={Inventory} />
        <Route path="/inventory/:id" component={InventoryDetail} />
        <Route path="/quarterly" component={QuarterlyBoard} />
        <Route path="/capacity" component={Capacity} />
        <Route path="/manifest/:id" component={Manifest} />
        <Route path="/run-sheet" component={RunSheet} />
        <Route path="/exceptions" component={Exceptions} />
        <Route path="/audit" component={AuditLog} />
        <Route path="/integrations" component={Integrations} />
        <Route path="/directory" component={Directory} />
        <Route path="/shipments" component={Shipments} />
        <Route path="/shipments/new" component={NewShipment} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <ProtectedRoutes />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
