import { useListExceptions, useRecomputeExceptions, getListExceptionsQueryKey, getGetDashboardOverviewQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, AlertTriangle, Info, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { Link } from "wouter";

export default function Exceptions() {
  const { data: exceptions, isLoading } = useListExceptions(undefined, { query: { refetchInterval: 60_000 } });
  const recompute = useRecomputeExceptions();
  const queryClient = useQueryClient();

  const handleRecompute = () => {
    recompute.mutate(undefined, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListExceptionsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardOverviewQueryKey() });
      }
    });
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical': return <AlertTriangle className="h-5 w-5 text-destructive" />;
      case 'high': return <AlertCircle className="h-5 w-5 text-orange-500" />;
      case 'medium': return <AlertCircle className="h-5 w-5 text-amber-500" />;
      case 'low': return <Info className="h-5 w-5 text-blue-500" />;
      default: return <Info className="h-5 w-5" />;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'destructive';
      case 'high': return 'default'; // orange ideally
      case 'medium': return 'secondary'; // amber ideally
      case 'low': return 'outline';
      default: return 'outline';
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Exceptions</h1>
          <p className="text-muted-foreground mt-1">Compliance and supply chain flags</p>
        </div>
        <Button onClick={handleRecompute} disabled={recompute.isPending} variant="outline">
          <RefreshCw className={`mr-2 h-4 w-4 ${recompute.isPending ? 'animate-spin' : ''}`} />
          {recompute.isPending ? 'Recomputing...' : 'Recompute Now'}
        </Button>
      </div>

      <div className="grid gap-4">
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading exceptions...</div>
        ) : exceptions?.length === 0 ? (
          <div className="text-center py-12 bg-card border rounded-lg">
            <AlertTriangle className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium">No open exceptions</h3>
            <p className="text-muted-foreground">All supply chain constraints are currently met.</p>
          </div>
        ) : (
          exceptions?.map((exception) => (
            <Card key={exception.id} className="overflow-hidden">
              <div className={`h-1 w-full ${exception.severity === 'critical' ? 'bg-destructive' : exception.severity === 'high' ? 'bg-orange-500' : exception.severity === 'medium' ? 'bg-amber-500' : 'bg-blue-500'}`} />
              <CardContent className="p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row gap-4 sm:items-start">
                  <div className="mt-1 flex-shrink-0">
                    {getSeverityIcon(exception.severity)}
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant={getSeverityColor(exception.severity)} className="uppercase text-[10px] tracking-wider">
                        {exception.severity}
                      </Badge>
                      <span className="text-sm text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded">
                        {exception.code}
                      </span>
                      <span className="text-xs text-muted-foreground ml-auto">
                        {format(new Date(exception.detectedAt), "MMM d, h:mm a")}
                      </span>
                    </div>
                    <h3 className="font-semibold text-lg">{exception.message}</h3>
                    
                    <div className="mt-4 pt-4 border-t flex flex-wrap gap-x-6 gap-y-2 text-sm">
                      <div>
                        <span className="text-muted-foreground mr-2">Item:</span>
                        <Link href={`/inventory/${exception.itemId}`}>
                          <span className="font-medium text-primary hover:underline cursor-pointer">{exception.itemSku}</span>
                        </Link>
                      </div>
                      <div className="text-muted-foreground truncate max-w-[300px]">
                        {exception.itemDescription}
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
