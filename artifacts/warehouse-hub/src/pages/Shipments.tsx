import { useLocation } from "wouter";
import { Plus, Truck } from "lucide-react";
import { useListShipments } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Link } from "wouter";

export default function Shipments() {
  const [, navigate] = useLocation();
  const { data: shipments, isLoading } = useListShipments(undefined, {
    query: { refetchInterval: 30_000 },
  });

  function statusBadgeVariant(status: string): "default" | "secondary" | "outline" {
    if (status === "confirmed") return "default";
    if (status === "planned") return "secondary";
    return "outline";
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Truck className="h-7 w-7 text-primary" />
            Shipments
          </h1>
          <p className="text-muted-foreground mt-1">
            View and manage all outbound shipments.
          </p>
        </div>
        <Button onClick={() => navigate("/shipments/new")}>
          <Plus className="mr-2 h-4 w-4" />
          New Shipment
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading shipments...</div>
      ) : !shipments || shipments.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground border rounded-lg bg-card">
          <Truck className="mx-auto h-10 w-10 mb-3 opacity-30" />
          <p className="text-lg font-medium">No shipments yet</p>
          <p className="text-sm mt-1">Click <strong>New Shipment</strong> to create one.</p>
        </div>
      ) : (
        <div className="border rounded-lg bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Manifest #</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Warehouse</TableHead>
                <TableHead>Dock Slot</TableHead>
                <TableHead>Scheduled Date</TableHead>
                <TableHead className="text-right">Items</TableHead>
                <TableHead className="text-right">Pallets</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shipments.map((s: any) => (
                <TableRow key={s.id}>
                  <TableCell className="font-mono text-sm">{s.manifestNumber}</TableCell>
                  <TableCell>
                    <Badge variant={statusBadgeVariant(s.status)}>
                      {s.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{s.warehouseName}</TableCell>
                  <TableCell>{s.slotLabel}</TableCell>
                  <TableCell>{s.scheduledDate}</TableCell>
                  <TableCell className="text-right">{s.itemCount}</TableCell>
                  <TableCell className="text-right">{s.palletCount}</TableCell>
                  <TableCell>{s.supplierName ?? <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell>{s.clientName ?? <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell>
                    <Link href={"/manifest/" + s.id}>
                      <Button variant="outline" size="sm">
                        View manifest
                      </Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
