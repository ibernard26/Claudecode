import { useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetCapacityBoard,
  useCreateSlotReservation,
  useUpdateSlotReservation,
  useDeleteSlotReservation,
  useGetCurrentUser,
  useListInventory,
  getGetCapacityBoardQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  CalendarRange,
  Truck,
  X,
  Check,
  AlertTriangle,
  FileText,
} from "lucide-react";
import { Link } from "wouter";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function isoMonday(d: Date): string {
  const copy = new Date(
    Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()),
  );
  const day = copy.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  copy.setUTCDate(copy.getUTCDate() + offset);
  return copy.toISOString().slice(0, 10);
}

function shiftWeek(weekStart: string, weeks: number): string {
  const d = new Date(weekStart + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + weeks * 7);
  return d.toISOString().slice(0, 10);
}

interface ReserveDialogState {
  open: boolean;
  slotId: number | null;
  slotLabel: string;
  date: string;
  remaining: number;
}

export default function Capacity() {
  const today = useMemo(() => isoMonday(new Date()), []);
  const [weekStart, setWeekStart] = useState(today);
  const [warehouseId, setWarehouseId] = useState<number | undefined>(undefined);

  const { data: session } = useGetCurrentUser();
  const user = session?.user;

  const { data: board, isLoading } = useGetCapacityBoard(
    { weekStart, ...(warehouseId != null ? { warehouseId } : {}) },
    { query: { refetchInterval: 60_000 } },
  );
  const { data: items } = useListInventory();

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const createReservation = useCreateSlotReservation();
  const updateReservation = useUpdateSlotReservation();
  const deleteReservation = useDeleteSlotReservation();

  const [reserveDialog, setReserveDialog] = useState<ReserveDialogState>({
    open: false,
    slotId: null,
    slotLabel: "",
    date: "",
    remaining: 0,
  });
  const [palletInput, setPalletInput] = useState("1");
  const [referenceInput, setReferenceInput] = useState("");
  const [itemInput, setItemInput] = useState<string>("none");

  const canManage =
    user?.role === "admin" || user?.role === "warehouse_manager";
  const canReserve =
    canManage || user?.role === "supplier";

  const refetchBoard = () => {
    queryClient.invalidateQueries({
      queryKey: getGetCapacityBoardQueryKey({
        weekStart,
        ...(warehouseId != null ? { warehouseId } : {}),
      }),
    });
  };

  const openReserve = (
    slotId: number,
    slotLabel: string,
    date: string,
    remaining: number,
  ) => {
    setReserveDialog({ open: true, slotId, slotLabel, date, remaining });
    setPalletInput("1");
    setReferenceInput("");
    setItemInput("none");
  };

  const submitReserve = () => {
    if (reserveDialog.slotId == null) return;
    const palletCount = Number(palletInput);
    if (!Number.isFinite(palletCount) || palletCount <= 0) {
      toast({ title: "Pallet count must be positive", variant: "destructive" });
      return;
    }
    createReservation.mutate(
      {
        data: {
          slotId: reserveDialog.slotId,
          weekStart,
          palletCount,
          reference: referenceInput || null,
          itemId: itemInput === "none" ? null : Number(itemInput),
        },
      },
      {
        onSuccess: () => {
          setReserveDialog({ ...reserveDialog, open: false });
          refetchBoard();
          toast({
            title: "Reservation requested",
            description: canManage
              ? "Confirmed and added to the board."
              : "Submitted for warehouse confirmation.",
          });
        },
        onError: (e: any) => {
          toast({
            title: "Could not create reservation",
            description: e?.message ?? "Please try again.",
            variant: "destructive",
          });
        },
      },
    );
  };

  const handleConfirm = (id: number) => {
    updateReservation.mutate(
      { id, data: { status: "confirmed" } as any },
      { onSuccess: refetchBoard },
    );
  };

  const handleCancel = (id: number) => {
    updateReservation.mutate(
      { id, data: { status: "cancelled" } as any },
      { onSuccess: refetchBoard },
    );
  };

  const handleDelete = (id: number) => {
    deleteReservation.mutate({ id }, { onSuccess: refetchBoard });
  };

  // Build day×slot matrix
  const matrix = useMemo(() => {
    if (!board) return null;
    const slotsByDay = new Map<number, typeof board.slotDefinitions>();
    for (let d = 0; d < 7; d++) slotsByDay.set(d, []);
    for (const s of board.slotDefinitions) {
      const arr = slotsByDay.get(s.dayOfWeek);
      if (arr) arr.push(s);
    }
    const reservationsBySlot = new Map<
      number,
      typeof board.reservations
    >();
    for (const r of board.reservations) {
      const arr = reservationsBySlot.get(r.slotId) ?? [];
      arr.push(r);
      reservationsBySlot.set(r.slotId, arr);
    }
    return { slotsByDay, reservationsBySlot };
  }, [board]);

  const weekRangeLabel = useMemo(() => {
    const start = new Date(weekStart + "T00:00:00Z");
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 4);
    return `${format(start, "MMM d")} – ${format(end, "MMM d, yyyy")}`;
  }, [weekStart]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <CalendarRange className="h-7 w-7 text-primary" />
            Capacity Planner
          </h1>
          <p className="text-muted-foreground mt-1">
            Reserve dock slots and forecast pallet space per warehouse, week by
            week.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select
            value={String(board?.warehouseId ?? warehouseId ?? "")}
            onValueChange={(v) => setWarehouseId(Number(v))}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Select warehouse" />
            </SelectTrigger>
            <SelectContent>
              {board?.warehouses.map((w) => (
                <SelectItem key={w.id} value={String(w.id)}>
                  {w.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setWeekStart(shiftWeek(weekStart, -1))}
            aria-label="Previous week"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            onClick={() => setWeekStart(today)}
            disabled={weekStart === today}
          >
            This week
          </Button>
          <div className="px-3 py-1.5 rounded-md border bg-muted/40 text-sm font-medium min-w-[170px] text-center">
            {weekRangeLabel}
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setWeekStart(shiftWeek(weekStart, 1))}
            aria-label="Next week"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {isLoading || !board || !matrix ? (
        <div className="text-center py-12 text-muted-foreground">
          Loading capacity board...
        </div>
      ) : board.slotDefinitions.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No dock slots configured for this warehouse yet.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-1">
          {[1, 2, 3, 4, 5].map((day) => {
            const slots = matrix.slotsByDay.get(day) ?? [];
            if (slots.length === 0) return null;
            const date = board.days.find((d) => d.dayOfWeek === day)?.date;
            return (
              <Card key={day}>
                <CardHeader className="pb-3 border-b bg-muted/30">
                  <CardTitle className="text-base flex items-center justify-between">
                    <span>
                      {DAY_LABELS[day]}{" "}
                      <span className="text-muted-foreground font-normal">
                        {date && format(new Date(date + "T00:00:00Z"), "MMM d")}
                      </span>
                    </span>
                    <span className="text-xs font-normal text-muted-foreground">
                      {slots.reduce(
                        (n, s) => n + (s.palletsReserved ?? 0),
                        0,
                      )}{" "}
                      /{" "}
                      {slots.reduce((n, s) => n + s.palletCapacity, 0)}{" "}
                      pallets reserved
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                  {slots.map((slot) => {
                    const reserved = slot.palletsReserved ?? 0;
                    const remaining = slot.palletCapacity - reserved;
                    const pct = Math.min(
                      100,
                      Math.round((reserved / slot.palletCapacity) * 100),
                    );
                    const reservations =
                      matrix.reservationsBySlot.get(slot.id) ?? [];
                    const isFull = remaining <= 0;
                    return (
                      <div
                        key={slot.id}
                        className="border rounded-lg p-3 flex flex-col gap-3 bg-card"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="font-semibold text-sm flex items-center gap-1.5">
                              <Truck className="h-3.5 w-3.5 text-muted-foreground" />
                              {slot.label}
                            </div>
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {slot.startTime} – {slot.endTime}
                            </div>
                          </div>
                          {canReserve && date && (
                            <Button
                              size="sm"
                              variant={isFull ? "outline" : "default"}
                              disabled={isFull}
                              onClick={() =>
                                openReserve(
                                  slot.id,
                                  slot.label,
                                  date,
                                  remaining,
                                )
                              }
                              className="h-7 px-2"
                            >
                              <Plus className="h-3.5 w-3.5 mr-1" />
                              Reserve
                            </Button>
                          )}
                        </div>
                        <div>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-muted-foreground">
                              {reserved} of {slot.palletCapacity} pallets
                            </span>
                            <span
                              className={
                                pct >= 90
                                  ? "text-destructive font-medium"
                                  : pct >= 70
                                    ? "text-amber-600 font-medium"
                                    : "text-muted-foreground"
                              }
                            >
                              {pct}%
                            </span>
                          </div>
                          <Progress
                            value={pct}
                            className={
                              pct >= 90
                                ? "[&>div]:bg-destructive"
                                : pct >= 70
                                  ? "[&>div]:bg-amber-500"
                                  : ""
                            }
                          />
                        </div>
                        {reservations.length > 0 ? (
                          <div className="space-y-1.5">
                            {reservations.map((r) => (
                              <div
                                key={r.id}
                                className="text-xs border rounded px-2 py-1.5 flex items-start justify-between gap-2 bg-muted/30"
                              >
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <Badge
                                      variant={
                                        r.status === "confirmed"
                                          ? "default"
                                          : r.status === "planned"
                                            ? "secondary"
                                            : "outline"
                                      }
                                      className="h-4 text-[10px] px-1.5"
                                    >
                                      {r.status}
                                    </Badge>
                                    <span className="font-medium">
                                      {r.palletCount} plt
                                    </span>
                                    {r.supplierName && (
                                      <span className="text-muted-foreground">
                                        · {r.supplierName}
                                      </span>
                                    )}
                                  </div>
                                  {r.itemSku && (
                                    <div className="text-muted-foreground truncate">
                                      {r.itemSku} — {r.itemDescription}
                                    </div>
                                  )}
                                  {r.reference && (
                                    <div className="text-muted-foreground truncate italic">
                                      {r.reference}
                                    </div>
                                  )}
                                </div>
                                <div className="flex flex-col gap-0.5 shrink-0">
                                  {canManage && r.status === "planned" && (
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-5 w-5"
                                      onClick={() => handleConfirm(r.id)}
                                      title="Confirm"
                                    >
                                      <Check className="h-3 w-3 text-green-600" />
                                    </Button>
                                  )}
                                  {r.status === "confirmed" && (
                                    <Link href={`/manifest/${r.id}`}>
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        className="h-5 w-5"
                                        title="Open shipment manifest"
                                      >
                                        <FileText className="h-3 w-3 text-primary" />
                                      </Button>
                                    </Link>
                                  )}
                                  {(canManage ||
                                    r.createdById === user?.id ||
                                    (user?.role === "supplier" &&
                                      r.supplierId === user?.supplierId)) && (
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-5 w-5"
                                      onClick={() =>
                                        canManage
                                          ? handleCancel(r.id)
                                          : handleDelete(r.id)
                                      }
                                      title={
                                        canManage ? "Cancel" : "Withdraw"
                                      }
                                    >
                                      <X className="h-3 w-3 text-destructive" />
                                    </Button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-xs text-muted-foreground italic">
                            No reservations
                          </div>
                        )}
                        {isFull && (
                          <div className="flex items-center gap-1 text-xs text-destructive">
                            <AlertTriangle className="h-3 w-3" />
                            Slot at capacity
                          </div>
                        )}
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog
        open={reserveDialog.open}
        onOpenChange={(open) =>
          setReserveDialog({ ...reserveDialog, open })
        }
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reserve dock-slot capacity</DialogTitle>
            <DialogDescription>
              {reserveDialog.slotLabel} on{" "}
              {reserveDialog.date &&
                format(
                  new Date(reserveDialog.date + "T00:00:00Z"),
                  "EEEE, MMM d",
                )}{" "}
              · {reserveDialog.remaining} pallets remaining
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="palletCount">Pallets to reserve</Label>
              <Input
                id="palletCount"
                type="number"
                min={1}
                max={reserveDialog.remaining || 1}
                value={palletInput}
                onChange={(e) => setPalletInput(e.target.value)}
              />
            </div>
            {items && items.length > 0 && (
              <div className="grid gap-2">
                <Label htmlFor="itemId">Linked inventory item (optional)</Label>
                <Select value={itemInput} onValueChange={setItemInput}>
                  <SelectTrigger id="itemId">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    <SelectItem value="none">— None —</SelectItem>
                    {items.map((it) => (
                      <SelectItem key={it.id} value={String(it.id)}>
                        {it.sku} — {it.description}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid gap-2">
              <Label htmlFor="reference">Reference / notes (optional)</Label>
              <Textarea
                id="reference"
                value={referenceInput}
                onChange={(e) => setReferenceInput(e.target.value)}
                placeholder="PO number, ASN, special handling…"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() =>
                setReserveDialog({ ...reserveDialog, open: false })
              }
            >
              Cancel
            </Button>
            <Button
              onClick={submitReserve}
              disabled={createReservation.isPending}
            >
              {createReservation.isPending
                ? "Submitting…"
                : canManage
                  ? "Confirm reservation"
                  : "Request reservation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
