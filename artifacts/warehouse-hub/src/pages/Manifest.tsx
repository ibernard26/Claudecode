import { useEffect, useMemo, useRef } from "react";
import { useParams, Link } from "wouter";
import { useGetReservationManifest } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Printer, ArrowLeft, AlertTriangle } from "lucide-react";
import { format } from "date-fns";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function fmtDate(iso?: string | null, pat = "MMM d, yyyy") {
  if (!iso) return "—";
  try {
    return format(new Date(iso), pat);
  } catch {
    return iso;
  }
}

function fmtDim(n?: number | null, unit = "in") {
  if (n == null) return "—";
  return `${n}${unit}`;
}

function Field({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className={`text-sm ${mono ? "font-mono" : ""}`}>
        {value ?? "—"}
      </div>
    </div>
  );
}

export default function Manifest() {
  const params = useParams<{ id: string }>();
  const id = Number(params?.id);
  const { data, isLoading, error } = useGetReservationManifest(id);

  // Render a simple Code-128-style barcode using a <canvas> placeholder.
  const barcodeRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = barcodeRef.current;
    if (!canvas || !data?.barcodePayload) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = canvas.clientWidth * 2;
    canvas.height = canvas.clientHeight * 2;
    ctx.scale(2, 2);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#000";
    // Hash payload to deterministic stripes
    const text = data.barcodePayload;
    let seed = 0;
    for (let i = 0; i < text.length; i++) seed = (seed * 31 + text.charCodeAt(i)) & 0xffff;
    const totalBars = 60;
    const barAreaW = w - 16;
    const barW = barAreaW / totalBars;
    let x = 8;
    for (let i = 0; i < totalBars; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      const widthFactor = 0.4 + ((seed >> 8) & 7) / 12; // 0.4..0.99
      const isBar = ((seed >> 4) & 1) === 1 || i % 7 === 0;
      if (isBar) {
        ctx.fillRect(x, 6, barW * widthFactor, h - 28);
      }
      x += barW;
    }
    ctx.fillStyle = "#000";
    ctx.font = "bold 9px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillText(text, w / 2, h - 6);
  }, [data?.barcodePayload]);

  const handlePrint = () => window.print();

  const dayLabel = useMemo(() => {
    if (!data) return "";
    return DAY_LABELS[data.slot.dayOfWeek] ?? "";
  }, [data]);

  if (isLoading) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        Loading manifest…
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        Could not load this manifest.
        <div className="mt-4">
          <Link href="/capacity">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-1" /> Back to Capacity
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const p = data.packaging;
  const handlingFlags: { label: string; tone: "warn" | "info" }[] = [];
  if (p?.hazmatFlag) handlingFlags.push({ label: "HAZMAT", tone: "warn" });
  if (p?.restrictedMaterialFlag)
    handlingFlags.push({ label: "RESTRICTED", tone: "warn" });
  if (p?.temperatureControlRequired)
    handlingFlags.push({ label: "TEMP-CONTROLLED", tone: "warn" });
  if (p?.fragile) handlingFlags.push({ label: "FRAGILE", tone: "warn" });
  if (p?.stackable === false)
    handlingFlags.push({ label: "DO NOT STACK", tone: "warn" });
  if (p?.asnRequired) handlingFlags.push({ label: "ASN REQUIRED", tone: "info" });

  return (
    <div className="manifest-root">
      <style>{`
        @media print {
          @page { size: letter; margin: 0.5in; }
          body { background: white !important; }
          .no-print { display: none !important; }
          .manifest-root { padding: 0 !important; }
          .manifest-paper { box-shadow: none !important; border: none !important; }
          aside, nav, header.app-header { display: none !important; }
        }
      `}</style>

      <div className="no-print flex items-center justify-between mb-4">
        <Link href="/capacity">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to Capacity
          </Button>
        </Link>
        <Button onClick={handlePrint} size="sm">
          <Printer className="h-4 w-4 mr-1.5" /> Print manifest
        </Button>
      </div>

      <div className="manifest-paper bg-white text-black border rounded-md shadow-sm max-w-[8.5in] mx-auto p-8 print:p-0">
        {/* Header */}
        <div className="flex items-start justify-between border-b-2 border-black pb-4">
          <div>
            <div className="text-xs uppercase tracking-widest text-gray-500">
              Shoebill AI
            </div>
            <h1 className="text-2xl font-bold mt-0.5">SHIPMENT MANIFEST</h1>
            <div className="text-xs text-gray-600 mt-1">
              Generated {fmtDate(data.generatedAt, "PP p")} by{" "}
              {data.generatedBy}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase font-semibold text-gray-500">
              Manifest #
            </div>
            <div className="text-base font-mono font-bold">
              {data.manifestNumber}
            </div>
            <Badge
              variant="outline"
              className="mt-1 uppercase text-[10px] border-black text-black"
            >
              {data.reservation.status}
            </Badge>
          </div>
        </div>

        {/* Schedule */}
        <section className="mt-5 grid grid-cols-4 gap-4 text-black">
          <Field
            label="Scheduled date"
            value={
              <span>
                {fmtDate(data.scheduledDate, "EEE, MMM d, yyyy")}
                <div className="text-xs text-gray-600">
                  Week of {fmtDate(data.reservation.weekStart, "MMM d")}
                </div>
              </span>
            }
          />
          <Field
            label="Dock slot"
            value={
              <span>
                {data.slot.label}
                <div className="text-xs text-gray-600">
                  {dayLabel} · {data.slot.startTime} – {data.slot.endTime}
                </div>
              </span>
            }
          />
          <Field
            label="Pallets"
            value={
              <span className="text-lg font-bold">
                {data.reservation.palletCount}
                <span className="text-xs text-gray-600 font-normal">
                  {" "}
                  / slot cap {data.slot.palletCapacity}
                </span>
              </span>
            }
          />
          <Field
            label="Reference"
            value={data.reservation.reference || "—"}
            mono
          />
        </section>

        {/* Parties */}
        <section className="mt-6 grid grid-cols-3 gap-4 border-t border-gray-300 pt-5">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 mb-1">
              Warehouse
            </div>
            <div className="font-semibold">{data.warehouse.name}</div>
            {data.warehouse.code && (
              <div className="text-xs text-gray-600 font-mono">
                {data.warehouse.code}
              </div>
            )}
            {data.warehouse.location && (
              <div className="text-xs text-gray-600 mt-0.5">
                {data.warehouse.location}
              </div>
            )}
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 mb-1">
              Supplier
            </div>
            {data.supplier ? (
              <>
                <div className="font-semibold">{data.supplier.name}</div>
                {data.supplier.code && (
                  <div className="text-xs text-gray-600 font-mono">
                    {data.supplier.code}
                  </div>
                )}
              </>
            ) : (
              <div className="text-sm text-gray-500 italic">Unassigned</div>
            )}
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 mb-1">
              Client
            </div>
            {data.client ? (
              <>
                <div className="font-semibold">{data.client.name}</div>
                {data.client.code && (
                  <div className="text-xs text-gray-600 font-mono">
                    {data.client.code}
                  </div>
                )}
              </>
            ) : (
              <div className="text-sm text-gray-500 italic">—</div>
            )}
          </div>
        </section>

        {/* Item / Packing list */}
        <section className="mt-6 border-t border-gray-300 pt-5">
          <h2 className="text-sm font-bold uppercase tracking-wide mb-3">
            Packing List
          </h2>
          {data.item ? (
            <div className="border border-gray-300 rounded">
              <table className="w-full text-sm">
                <thead className="bg-gray-100 text-[11px] uppercase tracking-wide">
                  <tr>
                    <th className="text-left p-2 border-b border-gray-300">
                      SKU / Part
                    </th>
                    <th className="text-left p-2 border-b border-gray-300">
                      Description
                    </th>
                    <th className="text-left p-2 border-b border-gray-300">
                      PO / ASN
                    </th>
                    <th className="text-left p-2 border-b border-gray-300">
                      Bin
                    </th>
                    <th className="text-right p-2 border-b border-gray-300">
                      Pallets
                    </th>
                    <th className="text-right p-2 border-b border-gray-300">
                      Qty / pallet
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="p-2 align-top">
                      <div className="font-mono font-semibold">
                        {data.item.sku}
                      </div>
                      {data.item.partNumber && (
                        <div className="text-xs text-gray-600 font-mono">
                          {data.item.partNumber}
                        </div>
                      )}
                    </td>
                    <td className="p-2 align-top">{data.item.description}</td>
                    <td className="p-2 align-top text-xs">
                      {data.item.poNumber && (
                        <div>PO {data.item.poNumber}</div>
                      )}
                      {data.item.asnNumber && (
                        <div>ASN {data.item.asnNumber}</div>
                      )}
                      {!data.item.poNumber && !data.item.asnNumber && "—"}
                    </td>
                    <td className="p-2 align-top text-xs font-mono">
                      {data.item.warehouseLocation ?? "—"}
                    </td>
                    <td className="p-2 align-top text-right font-bold">
                      {data.reservation.palletCount}
                    </td>
                    <td className="p-2 align-top text-right">
                      {p?.unitsPerCase != null && p?.casesPerPallet != null
                        ? `${(p.unitsPerCase ?? 0) * (p.casesPerPallet ?? 0)} ${p.unitOfMeasure ?? ""}`
                        : "—"}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-sm text-gray-500 italic">
              No inventory item linked — this reservation holds dock-slot
              capacity only.
            </div>
          )}
        </section>

        {/* Packaging spec */}
        {p && (
          <section className="mt-6 border-t border-gray-300 pt-5">
            <h2 className="text-sm font-bold uppercase tracking-wide mb-3">
              Packaging &amp; Pallet Spec
            </h2>
            <div className="grid grid-cols-4 gap-x-6 gap-y-3">
              <Field
                label="Package L×W×H"
                value={`${fmtDim(p.packageLength)} × ${fmtDim(p.packageWidth)} × ${fmtDim(p.packageHeight)}`}
              />
              <Field
                label="Package weight"
                value={fmtDim(p.packageWeight, " lb")}
              />
              <Field
                label="Pallet L×W×H"
                value={`${fmtDim(p.palletLength)} × ${fmtDim(p.palletWidth)} × ${fmtDim(p.palletHeight)}`}
              />
              <Field
                label="Pallet weight"
                value={fmtDim(p.palletWeight, " lb")}
              />
              <Field label="Units / case" value={p.unitsPerCase ?? "—"} />
              <Field label="Cases / pallet" value={p.casesPerPallet ?? "—"} />
              <Field
                label="Max stack"
                value={p.maxStackHeight ? `${p.maxStackHeight} high` : "—"}
              />
              <Field label="Freight class" value={p.freightClass ?? "—"} />
              <Field label="Carrier" value={p.carrierRequirement ?? "—"} />
              <Field label="Dock assignment" value={p.dockAssignment ?? "—"} />
              <Field
                label="Load sequence"
                value={p.loadSequence != null ? `#${p.loadSequence}` : "—"}
              />
              <Field
                label="Orientation"
                value={p.orientationRequirement ?? "—"}
              />
            </div>
          </section>
        )}

        {/* Handling flags */}
        {handlingFlags.length > 0 && (
          <section className="mt-6 border-t border-gray-300 pt-5">
            <h2 className="text-sm font-bold uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4" />
              Handling Requirements
            </h2>
            <div className="flex flex-wrap gap-2">
              {handlingFlags.map((f) => (
                <span
                  key={f.label}
                  className={`px-2 py-1 text-xs font-bold uppercase tracking-wide border-2 rounded ${
                    f.tone === "warn"
                      ? "border-black bg-yellow-200 text-black"
                      : "border-gray-400 bg-gray-100 text-gray-800"
                  }`}
                >
                  {f.label}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Compliance flags */}
        {data.flags.length > 0 && (
          <section className="mt-6 border-t border-gray-300 pt-5">
            <h2 className="text-sm font-bold uppercase tracking-wide mb-2">
              Open Exceptions
            </h2>
            <ul className="text-sm space-y-1">
              {data.flags.map((f) => (
                <li key={f.id} className="flex gap-2 items-start">
                  <span
                    className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border ${
                      f.severity === "high"
                        ? "border-red-600 text-red-700"
                        : f.severity === "medium"
                          ? "border-amber-600 text-amber-700"
                          : "border-gray-400 text-gray-700"
                    }`}
                  >
                    {f.severity}
                  </span>
                  <div>
                    <span className="font-mono text-xs text-gray-600">
                      {f.code}
                    </span>{" "}
                    {f.message}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Notes from packaging spec */}
        {p &&
          (p.warehouseHandlingNotes ||
            p.supplierComplianceNotes ||
            p.clientPackagingNotes ||
            p.labelingRequirements) && (
            <section className="mt-6 border-t border-gray-300 pt-5">
              <h2 className="text-sm font-bold uppercase tracking-wide mb-3">
                Instructions
              </h2>
              <div className="grid grid-cols-1 gap-3 text-sm">
                {p.warehouseHandlingNotes && (
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                      Warehouse handling
                    </div>
                    <div>{p.warehouseHandlingNotes}</div>
                  </div>
                )}
                {p.supplierComplianceNotes && (
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                      Supplier compliance
                    </div>
                    <div>{p.supplierComplianceNotes}</div>
                  </div>
                )}
                {p.clientPackagingNotes && (
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                      Client packaging
                    </div>
                    <div>{p.clientPackagingNotes}</div>
                  </div>
                )}
                {p.labelingRequirements && (
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                      Labeling
                    </div>
                    <div>{p.labelingRequirements}</div>
                  </div>
                )}
              </div>
            </section>
          )}

        {/* Barcode + signatures */}
        <section className="mt-8 border-t-2 border-black pt-4 grid grid-cols-2 gap-8 items-end">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 mb-1">
              Scan code
            </div>
            <canvas
              ref={barcodeRef}
              className="w-full h-20 border border-gray-300 rounded bg-white"
            />
            <div className="text-[10px] text-gray-500 mt-1 italic">
              Demo barcode — payload encoded above
            </div>
          </div>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <div className="border-b border-black h-10" />
              <div className="text-[10px] uppercase tracking-wide text-gray-500 mt-1">
                Driver signature / date
              </div>
            </div>
            <div>
              <div className="border-b border-black h-10" />
              <div className="text-[10px] uppercase tracking-wide text-gray-500 mt-1">
                Receiver signature / date
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
