import { useState } from "react";
import { useGetRunSheet, useListWarehouses } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Printer,
  AlertTriangle,
  Thermometer,
  Zap,
  Package,
  Clock,
  MapPin,
  ChevronRight,
} from "lucide-react";
import { format } from "date-fns";
import { useGetCurrentUser } from "@workspace/api-client-react";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function dateFromSearch(): string {
  const params = new URLSearchParams(window.location.search);
  const d = params.get("date");
  if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  return todayIso();
}

function HandlingBadge({ label, color }: { label: string; color: string }) {
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wider uppercase ${color}`}
    >
      {label}
    </span>
  );
}

export default function RunSheet() {
  const [date, setDate] = useState(dateFromSearch);
  const [warehouseId, setWarehouseId] = useState<string>("");
  const { data: session } = useGetCurrentUser();
  const user = session?.user;
  const { data: warehouses } = useListWarehouses();

  const isManager =
    user?.role === "admin" || user?.role === "warehouse_manager";

  const effectiveWarehouseId = warehouseId || String(warehouses?.[0]?.id ?? "");

  const { data: sheet, isLoading, error } = useGetRunSheet(
    {
      date,
      warehouseId: Number(effectiveWarehouseId),
    },
    { query: { enabled: !!date && !!effectiveWarehouseId } },
  );

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white; }
          .print-card { border: 1px solid #e5e7eb !important; box-shadow: none !important; break-inside: avoid; }
          .page-break { page-break-before: always; }
        }
      `}</style>

      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between no-print">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Daily Run Sheet</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Shift schedule grouped by dock, ordered by load time
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => window.print()}
            className="gap-2"
          >
            <Printer className="h-4 w-4" />
            Print
          </Button>
        </div>

        <div className="flex flex-wrap gap-4 items-end no-print">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="date-input">Date</Label>
            <Input
              id="date-input"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-44"
            />
          </div>
          {isManager && (
            <div className="flex flex-col gap-1.5">
              <Label>Warehouse</Label>
              <Select value={effectiveWarehouseId} onValueChange={setWarehouseId}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {warehouses?.map((w) => (
                    <SelectItem key={w.id} value={String(w.id)}>
                      {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {isLoading && (
          <div className="p-8 text-center text-muted-foreground">
            Loading run sheet…
          </div>
        )}

        {error && (
          <div className="p-8 text-center text-destructive">
            Failed to load run sheet.
          </div>
        )}

        {sheet && (
          <>
            <div className="border rounded-lg bg-card p-4 flex flex-wrap gap-6 items-center print-card">
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-wider">
                  Warehouse
                </div>
                <div className="font-bold text-lg">{sheet.warehouseName}</div>
                {sheet.warehouseLocation && (
                  <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <MapPin className="h-3 w-3" />
                    {sheet.warehouseLocation}
                  </div>
                )}
              </div>
              <div className="border-l pl-6">
                <div className="text-xs text-muted-foreground uppercase tracking-wider">
                  Date
                </div>
                <div className="font-bold text-lg">
                  {sheet.dayLabel},{" "}
                  {format(new Date(sheet.date + "T00:00:00"), "MMM d, yyyy")}
                </div>
              </div>
              <div className="border-l pl-6">
                <div className="text-xs text-muted-foreground uppercase tracking-wider">
                  Active Docks
                </div>
                <div className="font-bold text-lg">{sheet.totalDocks}</div>
              </div>
              <div className="border-l pl-6">
                <div className="text-xs text-muted-foreground uppercase tracking-wider">
                  Reservations
                </div>
                <div className="font-bold text-lg">{sheet.totalReservations}</div>
              </div>
              <div className="border-l pl-6">
                <div className="text-xs text-muted-foreground uppercase tracking-wider">
                  Total Pallets
                </div>
                <div className="font-bold text-lg">{sheet.totalPallets}</div>
              </div>
              <div className="ml-auto text-xs text-muted-foreground">
                Generated {format(new Date(sheet.generatedAt), "MMM d, h:mm a")}
              </div>
            </div>

            {sheet.docks.length === 0 && (
              <div className="flex flex-col items-center justify-center h-40 text-muted-foreground border rounded-lg bg-card">
                <Package className="h-8 w-8 mb-2 opacity-30" />
                <p>No confirmed reservations for this day.</p>
              </div>
            )}

            <div className="flex flex-col gap-6">
              {sheet.docks.map((dock, dockIdx) => (
                <Card key={dock.slotId} className={`print-card ${dockIdx > 0 ? "" : ""}`}>
                  <CardHeader className="bg-muted/40 border-b py-3 px-4">
                    <CardTitle className="flex items-center justify-between text-base">
                      <div className="flex items-center gap-3">
                        <span className="text-primary font-mono text-sm bg-primary/10 px-2 py-0.5 rounded">
                          DOCK
                        </span>
                        <span>{dock.label}</span>
                        <div className="flex items-center gap-1 text-muted-foreground font-normal text-sm">
                          <Clock className="h-3.5 w-3.5" />
                          {dock.startTime} – {dock.endTime}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-normal text-muted-foreground">
                          {dock.palletsReserved} / {dock.palletCapacity} pallets
                        </span>
                        <div className="w-24 h-2 rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              dock.palletsReserved / dock.palletCapacity > 0.8
                                ? "bg-destructive"
                                : dock.palletsReserved / dock.palletCapacity > 0.5
                                ? "bg-amber-500"
                                : "bg-green-500"
                            }`}
                            style={{
                              width: `${Math.min(100, (dock.palletsReserved / dock.palletCapacity) * 100)}%`,
                            }}
                          />
                        </div>
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/20 text-xs text-muted-foreground uppercase tracking-wider">
                          <th className="text-left px-4 py-2 w-10">#</th>
                          <th className="text-left px-4 py-2">Supplier</th>
                          <th className="text-left px-4 py-2">Client</th>
                          <th className="text-left px-4 py-2">SKU / Item</th>
                          <th className="text-left px-4 py-2">Location</th>
                          <th className="text-center px-4 py-2 w-16">Pallets</th>
                          <th className="text-left px-4 py-2">Handling</th>
                          <th className="text-left px-4 py-2">Reference</th>
                          <th className="text-center px-4 py-2 w-12">Flags</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dock.reservations.map((res, idx) => (
                          <tr
                            key={res.id}
                            className={`border-b last:border-0 hover:bg-muted/10 transition-colors ${
                              idx % 2 === 0 ? "" : "bg-muted/5"
                            }`}
                          >
                            <td className="px-4 py-3 font-mono text-muted-foreground">
                              {String(res.seq).padStart(2, "0")}
                            </td>
                            <td className="px-4 py-3 font-medium">
                              {res.supplierName ?? <span className="text-muted-foreground italic">—</span>}
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">
                              {res.clientName ?? "—"}
                            </td>
                            <td className="px-4 py-3">
                              {res.itemSku ? (
                                <div>
                                  <div className="font-mono font-medium text-xs">
                                    {res.itemSku}
                                  </div>
                                  {res.itemDescription && (
                                    <div className="text-xs text-muted-foreground truncate max-w-[180px]">
                                      {res.itemDescription}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <span className="text-muted-foreground italic text-xs">No item linked</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-xs text-muted-foreground font-mono">
                              {res.warehouseLocation ?? "—"}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <Badge variant="secondary" className="font-mono">
                                {res.palletCount}
                              </Badge>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex flex-wrap gap-1">
                                {res.hazmat && (
                                  <HandlingBadge
                                    label="HAZMAT"
                                    color="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400"
                                  />
                                )}
                                {res.fragile && (
                                  <HandlingBadge
                                    label="FRAGILE"
                                    color="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"
                                  />
                                )}
                                {res.temperatureControl && (
                                  <HandlingBadge
                                    label="TEMP"
                                    color="bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400"
                                  />
                                )}
                                {!res.hazmat && !res.fragile && !res.temperatureControl && (
                                  <span className="text-xs text-muted-foreground">—</span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-xs text-muted-foreground font-mono">
                              {res.reference ?? "—"}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {res.openFlagCount > 0 ? (
                                <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">
                                  {res.openFlagCount}
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground text-xs">✓</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              ))}
            </div>

            {sheet.docks.length > 0 && (
              <div className="border rounded-lg p-4 bg-muted/20 text-xs text-muted-foreground flex flex-wrap gap-6 print-card">
                <div className="flex items-center gap-2 font-semibold text-foreground">
                  Legend
                  <ChevronRight className="h-3 w-3" />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="inline-block w-3 h-3 rounded bg-red-100 border border-red-300" />
                  <Zap className="h-3 w-3 text-red-600" />
                  HAZMAT — special handling required
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="inline-block w-3 h-3 rounded bg-amber-100 border border-amber-300" />
                  FRAGILE — careful stacking
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="inline-block w-3 h-3 rounded bg-blue-100 border border-blue-300" />
                  <Thermometer className="h-3 w-3 text-blue-600" />
                  TEMP — temperature controlled
                </div>
                <div className="flex items-center gap-1.5">
                  <AlertTriangle className="h-3 w-3 text-destructive" />
                  Flags column = open compliance exceptions
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
