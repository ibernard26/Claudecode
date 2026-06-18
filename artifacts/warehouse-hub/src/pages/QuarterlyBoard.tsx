import { useGetQuarterlyBoard } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";

export default function QuarterlyBoard() {
  const { data: board, isLoading } = useGetQuarterlyBoard();

  if (isLoading) {
    return <div className="p-4">Loading quarterly board...</div>;
  }

  if (!board || board.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh] text-muted-foreground">
        <p>No quarterly data available</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold tracking-tight">Quarterly Board</h1>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {board.map((quarter) => (
          <Card key={`${quarter.year}-${quarter.quarter}`} className="flex flex-col h-full">
            <CardHeader className="bg-muted/30 border-b pb-4">
              <CardTitle className="flex justify-between items-center text-lg">
                <span>{quarter.quarter} {quarter.year}</span>
                <Badge variant="secondary">{quarter.totalItems} Items</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 p-4 flex flex-col gap-4">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Client Req</span>
                  <span className="font-medium">{quarter.clientRequested}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Supplier Pnd</span>
                  <span className="font-medium">{quarter.supplierPending}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Ready</span>
                  <span className="font-medium text-primary">{quarter.shipmentReady}</span>
                </div>
              </div>

              <div className="mt-4 flex-1 space-y-3">
                <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Priority Items</h4>
                {quarter.items.slice(0, 5).map((item) => (
                  <Link key={item.id} href={`/inventory/${item.id}`}>
                    <div className="group block p-3 rounded-md border bg-card hover:border-primary/50 transition-colors cursor-pointer shadow-sm">
                      <div className="flex justify-between items-start mb-1">
                        <span className="font-medium text-sm group-hover:text-primary transition-colors">{item.sku}</span>
                        {item.openExceptionCount > 0 && (
                          <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">
                            {item.openExceptionCount} err
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">{item.description}</div>
                      <div className="mt-2 flex justify-between items-center text-xs">
                        <span className="font-mono">{item.quantityOnHand} / {item.quantityRequested}</span>
                        <span className="capitalize">{item.status.replace(/([A-Z])/g, ' $1').trim()}</span>
                      </div>
                    </div>
                  </Link>
                ))}
                {quarter.items.length > 5 && (
                  <div className="text-xs text-center text-muted-foreground pt-2">
                    + {quarter.items.length - 5} more items
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
