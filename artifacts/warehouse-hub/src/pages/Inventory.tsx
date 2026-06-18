import { useState, useMemo, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  useListClients,
  useListSuppliers,
  useListWarehouses,
} from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Download, Package, ChevronLeft, ChevronRight } from "lucide-react";

const PAGE_SIZE = 100;

export function getStatusColor(status: string) {
  const s = status.toLowerCase();
  if (s.startsWith("pending")) return "secondary";
  if (s.startsWith("ready")) return "default";
  if (s === "shipped" || s === "closed") return "outline"; // Ideally green
  if (s === "delayed" || s === "backordered") return "destructive";
  return "outline";
}

export default function Inventory() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [quarter, setQuarter] = useState<string>("all");
  const [page, setPage] = useState(0);
  const [, setLocation] = useLocation();

  useEffect(() => { setPage(0); }, [search, status, quarter]);

  const { data: inventoryData, isLoading } = useQuery({
    queryKey: ["inventory", { search, status, quarter, page }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (status !== "all") params.set("status", status);
      if (quarter !== "all") params.set("quarter", quarter);
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(page * PAGE_SIZE));
      const res = await fetch(`/api/inventory?${params}`);
      if (!res.ok) throw new Error("Failed to fetch inventory");
      return res.json() as Promise<{
        items: Array<{
          id: number; sku: string; partNumber: string | null; description: string;
          quantityOnHand: number; quantityRequested: number; reorderPoint: number;
          status: string; priority: string | null; quarter: string; year: number;
          supplierId: number | null; clientId: number | null; warehouseId: number;
          warehouseLocation: string | null; openExceptionCount: number; lastUpdated: string;
        }>;
        total: number; limit: number; offset: number;
      }>;
    },
  });

  const inventory = inventoryData?.items ?? [];
  const total = inventoryData?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const { data: clients } = useListClients();
  const { data: suppliers } = useListSuppliers();
  const { data: warehouses } = useListWarehouses();

  const clientMap = useMemo(() => new Map(clients?.map((c) => [c.id, c.name])), [clients]);
  const supplierMap = useMemo(() => new Map(suppliers?.map((s) => [s.id, s.name])), [suppliers]);
  const warehouseMap = useMemo(() => new Map(warehouses?.map((w) => [w.id, w.name])), [warehouses]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight">Inventory</h1>
        <a href={`${import.meta.env.BASE_URL}api/export/inventory.csv`} download>
          <Button variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Export Tableau CSV
          </Button>
        </a>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 items-center bg-card p-4 rounded-lg border shadow-sm">
        <div className="relative w-full sm:w-[300px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search SKU or description..."
            className="pl-9 w-full"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="w-full sm:w-[200px]">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="Available">Available</SelectItem>
              <SelectItem value="PendingSupplier">Pending Supplier</SelectItem>
              <SelectItem value="PendingClient">Pending Client</SelectItem>
              <SelectItem value="PendingWarehouse">Pending Warehouse</SelectItem>
              <SelectItem value="ReadyForPicking">Ready for Picking</SelectItem>
              <SelectItem value="ReadyForPacking">Ready for Packing</SelectItem>
              <SelectItem value="ReadyForStaging">Ready for Staging</SelectItem>
              <SelectItem value="ReadyForLoading">Ready for Loading</SelectItem>
              <SelectItem value="ReadyForShipment">Ready for Shipment</SelectItem>
              <SelectItem value="Shipped">Shipped</SelectItem>
              <SelectItem value="Backordered">Backordered</SelectItem>
              <SelectItem value="Delayed">Delayed</SelectItem>
              <SelectItem value="Closed">Closed</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="w-full sm:w-[200px]">
          <Select value={quarter} onValueChange={setQuarter}>
            <SelectTrigger>
              <SelectValue placeholder="Quarter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Quarters</SelectItem>
              <SelectItem value="Q1">Q1</SelectItem>
              <SelectItem value="Q2">Q2</SelectItem>
              <SelectItem value="Q3">Q3</SelectItem>
              <SelectItem value="Q4">Q4</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="bg-card rounded-lg border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[120px]">SKU</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Req</TableHead>
                <TableHead className="text-right">Reorder</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Quarter</TableHead>
                <TableHead>Exceptions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-24 text-center">
                    Loading inventory...
                  </TableCell>
                </TableRow>
              ) : inventory?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-32 text-center">
                    <div className="flex flex-col items-center justify-center text-muted-foreground">
                      <Package className="h-8 w-8 mb-2 opacity-50" />
                      <p>No inventory items found</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                inventory?.map((item) => (
                  <TableRow
                    key={item.id}
                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => setLocation(`/inventory/${item.id}`)}
                  >
                    <TableCell className="font-medium">{item.sku}</TableCell>
                    <TableCell>
                      <div className="truncate max-w-[300px]" title={item.description}>
                        {item.description}
                      </div>
                      <div className="text-xs text-muted-foreground flex gap-2 mt-1">
                        {item.clientId && <span title="Client">{clientMap.get(item.clientId)}</span>}
                        {item.supplierId && <span title="Supplier">{supplierMap.get(item.supplierId)}</span>}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono">{item.quantityOnHand}</TableCell>
                    <TableCell className="text-right font-mono">{item.quantityRequested}</TableCell>
                    <TableCell className="text-right font-mono">{item.reorderPoint}</TableCell>
                    <TableCell>
                      <Badge variant={getStatusColor(item.status)} className="whitespace-nowrap">
                        {item.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="whitespace-nowrap">
                        {item.quarter} {item.year}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {item.openExceptionCount > 0 ? (
                        <Badge variant="destructive" className="rounded-full w-6 h-6 p-0 flex items-center justify-center">
                          {item.openExceptionCount}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-2">
          <p className="text-sm text-muted-foreground">
            Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total} items
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
            >
              <ChevronLeft className="h-4 w-4" />
              Prev
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {page + 1} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
