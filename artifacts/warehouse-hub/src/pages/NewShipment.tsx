import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Truck,
  ChevronLeft,
  Loader2,
} from "lucide-react";
import {
  useListWarehouses,
  useGetCapacityBoard,
  useListSuppliers,
  useListClients,
  useListInventory,
  useVerifyShipment,
  useCreateShipment,
} from "@workspace/api-client-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";

// ── helpers ────────────────────────────────────────────────────────────────

function isoMonday(d: Date): string {
  const copy = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = copy.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  copy.setUTCDate(copy.getUTCDate() + offset);
  return copy.toISOString().slice(0, 10);
}

interface VerifyCheck {
  code: string;
  label: string;
  status: "pass" | "warn" | "fail";
  detail?: string;
}

// ── component ──────────────────────────────────────────────────────────────

export default function NewShipment() {
  const [, navigate] = useLocation();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [form, setForm] = useState({
    warehouseId: "",
    weekStart: isoMonday(new Date()),
    slotId: "",
    palletCount: "1",
    supplierId: "",
    clientId: "",
    carrierRef: "",
    shipmentRef: "",
    asnNumber: "",
    reference: "",
  });
  const [selectedItemIds, setSelectedItemIds] = useState<number[]>([]);
  const [verifyResult, setVerifyResult] = useState<{
    canProceed: boolean;
    checks: VerifyCheck[];
  } | null>(null);
  const [itemStatusFilter, setItemStatusFilter] = useState("");
  const [itemSearch, setItemSearch] = useState("");

  // Data fetching
  const { data: warehouses } = useListWarehouses();
  const { data: suppliers } = useListSuppliers();
  const { data: clients } = useListClients();

  const capacityBoardEnabled = !!form.warehouseId && !!form.weekStart;
  const { data: capacityBoard } = useGetCapacityBoard(
    capacityBoardEnabled
      ? { weekStart: form.weekStart, warehouseId: Number(form.warehouseId) }
      : undefined,
    { query: { enabled: capacityBoardEnabled } },
  );

  const { data: inventoryData } = useListInventory({
    supplierId: form.supplierId ? Number(form.supplierId) : undefined,
    clientId: form.clientId ? Number(form.clientId) : undefined,
    status: itemStatusFilter || undefined,
    search: itemSearch || undefined,
  });

  const verifyShipment = useVerifyShipment();
  const createShipment = useCreateShipment();

  // Unique slots for the selected warehouse/week
  const slotOptions: Array<{ id: number; label: string; remaining: number }> = (() => {
    if (!capacityBoard?.slotDefinitions) return [];
    const seen = new Set<number>();
    const out: Array<{ id: number; label: string; remaining: number }> = [];
    for (const s of capacityBoard.slotDefinitions) {
      if (!seen.has(s.id)) {
        seen.add(s.id);
        const remaining = s.palletCapacity - (s.palletsReserved ?? 0);
        out.push({ id: s.id, label: s.label, remaining });
      }
    }
    return out;
  })();

  // Trigger verify when step becomes 3
  useEffect(() => {
    if (step === 3) {
      setVerifyResult(null);
      verifyShipment.mutate(
        {
          slotId: Number(form.slotId),
          weekStart: form.weekStart,
          palletCount: Number(form.palletCount),
          itemIds: selectedItemIds,
          carrierRef: form.carrierRef || undefined,
          asnNumber: form.asnNumber || undefined,
        },
        {
          onSuccess: (data: any) => setVerifyResult(data),
        },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const toggleItem = (id: number) => {
    setSelectedItemIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const step1Valid =
    form.warehouseId !== "" &&
    form.weekStart !== "" &&
    form.slotId !== "" &&
    form.palletCount !== "" &&
    Number(form.palletCount) > 0;

  const handleCreate = () => {
    createShipment.mutate(
      {
        slotId: Number(form.slotId),
        weekStart: form.weekStart,
        palletCount: Number(form.palletCount),
        itemIds: selectedItemIds,
        supplierId: form.supplierId ? Number(form.supplierId) : undefined,
        clientId: form.clientId ? Number(form.clientId) : undefined,
        carrierRef: form.carrierRef || undefined,
        shipmentRef: form.shipmentRef || undefined,
        asnNumber: form.asnNumber || undefined,
        reference: form.reference || undefined,
      },
      {
        onSuccess: () => navigate("/shipments"),
      },
    );
  };

  // ── Step 1 ────────────────────────────────────────────────────────────────

  const renderStep1 = () => (
    <div className="flex flex-col gap-6 max-w-2xl">
      <h2 className="text-xl font-semibold">Step 1 — Shipment Details</h2>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Warehouse */}
        <div className="grid gap-2">
          <Label htmlFor="warehouseId">Warehouse</Label>
          <Select
            value={form.warehouseId}
            onValueChange={(v) => setForm((f) => ({ ...f, warehouseId: v, slotId: "" }))}
          >
            <SelectTrigger id="warehouseId">
              <SelectValue placeholder="Select warehouse" />
            </SelectTrigger>
            <SelectContent>
              {(warehouses ?? []).map((w: any) => (
                <SelectItem key={w.id} value={String(w.id)}>
                  {w.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Week */}
        <div className="grid gap-2">
          <Label htmlFor="weekStart">Week (Monday)</Label>
          <Input
            id="weekStart"
            type="date"
            value={form.weekStart}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                weekStart: isoMonday(new Date(e.target.value + "T00:00:00")),
                slotId: "",
              }))
            }
          />
        </div>

        {/* Dock Slot */}
        <div className="grid gap-2">
          <Label htmlFor="slotId">Dock Slot</Label>
          <Select
            value={form.slotId}
            onValueChange={(v) => setForm((f) => ({ ...f, slotId: v }))}
            disabled={slotOptions.length === 0}
          >
            <SelectTrigger id="slotId">
              <SelectValue placeholder={slotOptions.length === 0 ? "Select warehouse & week first" : "Select slot"} />
            </SelectTrigger>
            <SelectContent>
              {slotOptions.map((s) => (
                <SelectItem key={s.id} value={String(s.id)}>
                  {s.label} — {s.remaining} pallets remaining
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Pallet Count */}
        <div className="grid gap-2">
          <Label htmlFor="palletCount">Pallet Count</Label>
          <Input
            id="palletCount"
            type="number"
            min={1}
            value={form.palletCount}
            onChange={(e) => setForm((f) => ({ ...f, palletCount: e.target.value }))}
          />
        </div>

        {/* Supplier */}
        <div className="grid gap-2">
          <Label htmlFor="supplierId">Supplier</Label>
          <Select
            value={form.supplierId || "_none"}
            onValueChange={(v) => setForm((f) => ({ ...f, supplierId: v === "_none" ? "" : v }))}
          >
            <SelectTrigger id="supplierId">
              <SelectValue placeholder="— none —" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">— none —</SelectItem>
              {(suppliers ?? []).map((s: any) => (
                <SelectItem key={s.id} value={String(s.id)}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Client */}
        <div className="grid gap-2">
          <Label htmlFor="clientId">Client</Label>
          <Select
            value={form.clientId || "_none"}
            onValueChange={(v) => setForm((f) => ({ ...f, clientId: v === "_none" ? "" : v }))}
          >
            <SelectTrigger id="clientId">
              <SelectValue placeholder="— none —" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">— none —</SelectItem>
              {(clients ?? []).map((c: any) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Carrier Reference */}
        <div className="grid gap-2">
          <Label htmlFor="carrierRef">Carrier Reference</Label>
          <Input
            id="carrierRef"
            value={form.carrierRef}
            onChange={(e) => setForm((f) => ({ ...f, carrierRef: e.target.value }))}
            placeholder="e.g. FEDEX-12345"
          />
        </div>

        {/* Shipment Reference */}
        <div className="grid gap-2">
          <Label htmlFor="shipmentRef">Shipment Reference</Label>
          <Input
            id="shipmentRef"
            value={form.shipmentRef}
            onChange={(e) => setForm((f) => ({ ...f, shipmentRef: e.target.value }))}
            placeholder="Internal reference"
          />
        </div>

        {/* ASN Number */}
        <div className="grid gap-2">
          <Label htmlFor="asnNumber">ASN Number</Label>
          <Input
            id="asnNumber"
            value={form.asnNumber}
            onChange={(e) => setForm((f) => ({ ...f, asnNumber: e.target.value }))}
            placeholder="Advance Shipment Notice #"
          />
        </div>
      </div>

      {/* Notes / Reference */}
      <div className="grid gap-2">
        <Label htmlFor="reference">Notes / Reference</Label>
        <Textarea
          id="reference"
          value={form.reference}
          onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))}
          placeholder="PO number, special handling instructions…"
          rows={3}
        />
      </div>

      <div className="flex justify-end">
        <Button
          onClick={() => setStep(2)}
          disabled={!step1Valid}
        >
          Next: Add Items
        </Button>
      </div>
    </div>
  );

  // ── Step 2 ────────────────────────────────────────────────────────────────

  const items: any[] = Array.isArray(inventoryData) ? inventoryData : (inventoryData as any)?.items ?? [];

  const renderStep2 = () => (
    <div className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold">Step 2 — Select Items</h2>

      <div className="flex gap-3 flex-wrap">
        <Input
          placeholder="Search SKU or description…"
          value={itemSearch}
          onChange={(e) => setItemSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select
          value={itemStatusFilter || "_all"}
          onValueChange={(v) => setItemStatusFilter(v === "_all" ? "" : v)}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">All statuses</SelectItem>
            <SelectItem value="ReadyForShipment">ReadyForShipment</SelectItem>
            <SelectItem value="ReadyForLoading">ReadyForLoading</SelectItem>
            <SelectItem value="ReadyForStaging">ReadyForStaging</SelectItem>
            <SelectItem value="Available">Available</SelectItem>
            <SelectItem value="OnHold">OnHold</SelectItem>
          </SelectContent>
        </Select>
        <span className="self-center text-sm text-muted-foreground">
          Selected: {selectedItemIds.length} item(s)
        </span>
      </div>

      <div className="border rounded-lg overflow-hidden max-h-[480px] overflow-y-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10"></TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">Exceptions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  No items found
                </TableCell>
              </TableRow>
            ) : (
              items.map((item: any) => {
                const selected = selectedItemIds.includes(item.id);
                return (
                  <TableRow
                    key={item.id}
                    className={selected ? "bg-primary/5" : undefined}
                    onClick={() => toggleItem(item.id)}
                    style={{ cursor: "pointer" }}
                  >
                    <TableCell>
                      <Checkbox
                        checked={selected}
                        onCheckedChange={() => toggleItem(item.id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </TableCell>
                    <TableCell className="font-mono text-sm">{item.sku}</TableCell>
                    <TableCell>{item.description}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {item.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{item.quantityOnHand}</TableCell>
                    <TableCell className="text-right">
                      {item.openFlagCount > 0 ? (
                        <Badge variant="destructive" className="text-xs">
                          {item.openFlagCount}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex justify-between">
        <Button variant="outline" onClick={() => setStep(1)}>
          <ChevronLeft className="mr-1 h-4 w-4" />
          Back
        </Button>
        <Button
          onClick={() => setStep(3)}
          disabled={selectedItemIds.length === 0}
        >
          Next: Verify
        </Button>
      </div>
    </div>
  );

  // ── Step 3 ────────────────────────────────────────────────────────────────

  const renderStep3 = () => {
    const passCount = verifyResult?.checks.filter((c) => c.status === "pass").length ?? 0;
    const warnCount = verifyResult?.checks.filter((c) => c.status === "warn").length ?? 0;
    const failCount = verifyResult?.checks.filter((c) => c.status === "fail").length ?? 0;

    return (
      <div className="flex flex-col gap-6 max-w-2xl">
        <h2 className="text-xl font-semibold">Step 3 — Verify &amp; Create</h2>

        {verifyShipment.isPending || !verifyResult ? (
          <div className="flex items-center gap-3 py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Running pre-submission checks…
          </div>
        ) : (
          <>
            {/* Checklist */}
            <div className="flex flex-col gap-2 border rounded-lg p-4">
              {verifyResult.checks.map((check) => (
                <div key={check.code} className="flex items-start gap-3 py-1">
                  <div className="mt-0.5 shrink-0">
                    {check.status === "pass" && (
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    )}
                    {check.status === "warn" && (
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                    )}
                    {check.status === "fail" && (
                      <XCircle className="h-4 w-4 text-destructive" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span
                      className={
                        check.status === "fail"
                          ? "text-sm font-medium text-destructive"
                          : check.status === "warn"
                          ? "text-sm font-medium text-amber-600"
                          : "text-sm font-medium text-green-700"
                      }
                    >
                      {check.label}
                    </span>
                    {check.detail && (
                      <p className="text-xs text-muted-foreground mt-0.5">{check.detail}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Summary */}
            <p className="text-sm text-muted-foreground">
              {passCount} check{passCount !== 1 ? "s" : ""} passed
              {warnCount > 0 && `, ${warnCount} warning${warnCount !== 1 ? "s" : ""}`}
              {failCount > 0 && `, ${failCount} failure${failCount !== 1 ? "s" : ""}`}
            </p>

            {/* Verify error */}
            {verifyShipment.isError && (
              <p className="text-sm text-destructive">
                Verification error: {(verifyShipment.error as any)?.message ?? "Unknown error"}
              </p>
            )}

            {/* Create error */}
            {createShipment.isError && (
              <p className="text-sm text-destructive">
                Creation error: {(createShipment.error as any)?.message ?? "Unknown error"}
              </p>
            )}

            {verifyResult.canProceed ? (
              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(2)}>
                  <ChevronLeft className="mr-1 h-4 w-4" />
                  Back
                </Button>
                <Button
                  onClick={handleCreate}
                  disabled={createShipment.isPending}
                >
                  {createShipment.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating…
                    </>
                  ) : (
                    "Create Shipment"
                  )}
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <p className="text-sm font-medium text-destructive">
                  Fix the issues above before creating this shipment.
                </p>
                <div>
                  <Button variant="outline" onClick={() => setStep(2)}>
                    <ChevronLeft className="mr-1 h-4 w-4" />
                    Back
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/shipments")}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Truck className="h-7 w-7 text-primary" />
            New Shipment
          </h1>
          <p className="text-muted-foreground mt-1">
            Step {step} of 3
          </p>
        </div>
      </div>

      {/* Step indicator */}
      <div className="flex gap-2">
        {([1, 2, 3] as const).map((s) => (
          <div
            key={s}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              s <= step ? "bg-primary" : "bg-muted"
            }`}
          />
        ))}
      </div>

      {step === 1 && renderStep1()}
      {step === 2 && renderStep2()}
      {step === 3 && renderStep3()}
    </div>
  );
}
