import { useState } from "react";
import { useListIntegrations, useListSyncJobs } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, CheckCircle2, XCircle, Clock } from "lucide-react";
import { format } from "date-fns";

export default function Integrations() {
  const { data: integrations, isLoading: loadingIntegrations } = useListIntegrations();
  const { data: jobs, isLoading: loadingJobs } = useListSyncJobs();
  const queryClient = useQueryClient();
  const [syncingId, setSyncingId] = useState<number | null>(null);

  const handleSync = async (integrationId: number) => {
    setSyncingId(integrationId);
    try {
      await fetch('/api/integrations/sync', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ integrationId }),
      });
      queryClient.invalidateQueries();
    } finally {
      setSyncingId(null);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status.toLowerCase()) {
      case 'active':
      case 'completed': return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'error':
      case 'failed': return <XCircle className="h-4 w-4 text-destructive" />;
      default: return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Integrations</h1>
        <p className="text-muted-foreground mt-1">Manage external system connections and syncs</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {loadingIntegrations ? (
          <div>Loading integrations...</div>
        ) : (
          integrations?.map((integration) => (
            <Card key={integration.id} className="flex flex-col">
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-lg">{integration.name}</CardTitle>
                    <div className="text-sm text-muted-foreground capitalize mt-1">{integration.kind}</div>
                  </div>
                  <Badge variant={integration.status === 'active' ? 'default' : 'secondary'} className="capitalize">
                    {integration.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col justify-between">
                <div className="space-y-3 text-sm mb-6">
                  <div className="flex justify-between items-center border-b pb-2">
                    <span className="text-muted-foreground">Last Sync</span>
                    <span>{integration.lastSyncAt ? format(new Date(integration.lastSyncAt), "MMM d, HH:mm") : 'Never'}</span>
                  </div>
                  <div className="flex justify-between items-center border-b pb-2">
                    <span className="text-muted-foreground">Status</span>
                    <span className="flex items-center gap-1.5">
                      {integration.lastSyncStatus ? getStatusIcon(integration.lastSyncStatus) : null}
                      <span className="capitalize">{integration.lastSyncStatus || 'Pending'}</span>
                    </span>
                  </div>
                  {integration.lastSyncMessage && (
                    <div className="text-xs text-muted-foreground bg-muted p-2 rounded mt-2 truncate" title={integration.lastSyncMessage}>
                      {integration.lastSyncMessage}
                    </div>
                  )}
                </div>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => handleSync(integration.id)}
                  disabled={syncingId === integration.id}
                >
                  <RefreshCw className={`mr-2 h-4 w-4 ${syncingId === integration.id ? "animate-spin" : ""}`} />
                  {syncingId === integration.id ? "Syncing..." : "Sync Now"}
                </Button>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <div>
        <h2 className="text-xl font-semibold mb-4">Recent Sync Jobs</h2>
        <Card>
          <CardContent className="p-0">
            {loadingJobs ? (
              <div className="p-4 text-center">Loading jobs...</div>
            ) : jobs?.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">No recent sync jobs</div>
            ) : (
              <div className="divide-y">
                {jobs?.slice(0, 10).map((job) => (
                  <div key={job.id} className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      {getStatusIcon(job.status)}
                      <div>
                        <div className="font-medium">{job.integrationName}</div>
                        <div className="text-xs text-muted-foreground">
                          {format(new Date(job.startedAt), "MMM d, yyyy HH:mm:ss")}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-6 text-sm">
                      <div className="text-right hidden sm:block">
                        <div className="font-mono">{job.recordsProcessed}</div>
                        <div className="text-xs text-muted-foreground">records</div>
                      </div>
                      <Badge variant={job.status === 'completed' ? 'outline' : job.status === 'failed' ? 'destructive' : 'secondary'} className="capitalize w-24 justify-center">
                        {job.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
