import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { 
  useGetInventoryItem, 
  getGetInventoryItemQueryKey,
  useUpdateInventoryItem,
  useUpdatePackagingSpec,
  useListItemNotes,
  useCreateItemNote,
  getListItemNotesQueryKey,
  getGetPackagingSpecQueryKey,
  useGetCurrentUser
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { getStatusColor } from "./Inventory";

import { 
  ArrowLeft, 
  Package, 
  AlertTriangle, 
  Info, 
  AlertCircle, 
  History, 
  MessageSquare,
  Box,
  Truck,
  Building2,
  Save,
  Check
} from "lucide-react";

export default function InventoryDetail({ params }: { params: { id: string } }) {
  const id = parseInt(params.id, 10);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: session } = useGetCurrentUser();
  const userRole = session?.user?.role;
  const isWritable = userRole === 'admin' || userRole === 'warehouse_manager';

  const { data: detail, isLoading } = useGetInventoryItem(id, {
    query: {
      enabled: Number.isFinite(id),
      queryKey: getGetInventoryItemQueryKey(id)
    }
  });

  const { data: notesList, isLoading: loadingNotes } = useListItemNotes(id, {
    query: {
      enabled: Number.isFinite(id),
      queryKey: getListItemNotesQueryKey(id)
    }
  });

  const updateItem = useUpdateInventoryItem();
  const updatePackaging = useUpdatePackagingSpec();
  const createNote = useCreateItemNote();

  // Overview Edit State
  const [editMode, setEditMode] = useState(false);
  const [itemForm, setItemForm] = useState<any>({});

  const handleEditOverview = () => {
    if (!detail) return;
    setItemForm({
      status: detail.item.status,
      priority: detail.item.priority || "",
      quantityOnHand: detail.item.quantityOnHand,
      quantityRequested: detail.item.quantityRequested,
      reorderPoint: detail.item.reorderPoint,
      warehouseLocation: detail.item.warehouseLocation || "",
      partNumber: detail.item.partNumber || "",
      carrierRef: detail.item.carrierRef || "",
    });
    setEditMode(true);
  };

  const handleSaveOverview = () => {
    updateItem.mutate(
      { id, data: {
        ...itemForm,
        priority: itemForm.priority || null,
        warehouseLocation: itemForm.warehouseLocation || null,
        partNumber: itemForm.partNumber || null,
        carrierRef: itemForm.carrierRef || null,
      }},
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetInventoryItemQueryKey(id) });
          setEditMode(false);
          toast({ title: "Item updated successfully" });
        },
        onError: () => {
          toast({ title: "Failed to update item", variant: "destructive" });
        }
      }
    );
  };

  // Packaging Edit State
  const [packEditMode, setPackEditMode] = useState(false);
  const [packForm, setPackForm] = useState<any>({});

  const handleEditPackaging = () => {
    if (!detail) return;
    setPackForm({
      ...detail.packaging
    });
    setPackEditMode(true);
  };

  const handleSavePackaging = () => {
    updatePackaging.mutate(
      { id, data: packForm },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetInventoryItemQueryKey(id) });
          queryClient.invalidateQueries({ queryKey: getGetPackagingSpecQueryKey(id) });
          setPackEditMode(false);
          toast({ title: "Packaging updated successfully" });
        },
        onError: () => {
          toast({ title: "Failed to update packaging", variant: "destructive" });
        }
      }
    );
  };

  // Notes Compose State
  const [noteBody, setNoteBody] = useState("");
  const [noteVisibility, setNoteVisibility] = useState<string>("shared");
  const [noteCategory, setNoteCategory] = useState<string>("general");

  const visibilityOptions = useMemo(() => {
    if (userRole === 'admin') return ["shared", "client_visible", "supplier_visible", "warehouse_internal", "admin_only"];
    if (userRole === 'warehouse_manager') return ["shared", "client_visible", "supplier_visible", "warehouse_internal"];
    if (userRole === 'supplier') return ["shared", "supplier_visible"];
    if (userRole === 'client') return ["shared", "client_visible"];
    return [];
  }, [userRole]);

  const handlePostNote = () => {
    if (!noteBody.trim()) return;
    createNote.mutate(
      { id, data: { body: noteBody, visibility: noteVisibility as any, category: noteCategory as any } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListItemNotesQueryKey(id) });
          setNoteBody("");
          toast({ title: "Note posted" });
        },
        onError: () => {
          toast({ title: "Failed to post note", variant: "destructive" });
        }
      }
    );
  };

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground">Loading item details...</div>;
  }

  if (!detail) {
    return <div className="p-8 text-center text-destructive">Item not found.</div>;
  }

  const { item, packaging, exceptions, history } = detail;

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
    <div className="flex flex-col gap-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-4 border-b pb-4">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/inventory")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">{item.sku}</h1>
            <Badge variant={getStatusColor(item.status)}>{item.status}</Badge>
            {item.priority && <Badge variant="outline">{item.priority}</Badge>}
          </div>
          <p className="text-muted-foreground mt-1">{item.description}</p>
        </div>
        <div className="text-right">
          <div className="text-sm text-muted-foreground">Quarter</div>
          <div className="font-medium">{item.quarter} {item.year}</div>
        </div>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="packaging">Packaging & Load</TabsTrigger>
          <TabsTrigger value="notes">Notes ({notesList?.length || 0})</TabsTrigger>
          <TabsTrigger value="exceptions">
            Exceptions 
            {exceptions.length > 0 && <Badge variant="destructive" className="ml-2 px-1.5 h-5">{exceptions.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Item Details</CardTitle>
                  <CardDescription>Core identifiers and status</CardDescription>
                </div>
                {isWritable && !editMode && (
                  <Button variant="outline" size="sm" onClick={handleEditOverview}>Edit</Button>
                )}
                {isWritable && editMode && (
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setEditMode(false)}>Cancel</Button>
                    <Button size="sm" onClick={handleSaveOverview} disabled={updateItem.isPending}>
                      {updateItem.isPending ? <Save className="h-4 w-4 mr-2 animate-pulse" /> : <Save className="h-4 w-4 mr-2" />}
                      Save
                    </Button>
                  </div>
                )}
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-muted-foreground">Part Number</Label>
                    {editMode ? (
                      <Input value={itemForm.partNumber} onChange={e => setItemForm({...itemForm, partNumber: e.target.value})} />
                    ) : (
                      <div className="font-medium">{item.partNumber || "-"}</div>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-muted-foreground">Serial Number</Label>
                    <div className="font-medium">{item.serialNumber || "-"}</div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-muted-foreground">Status</Label>
                    {editMode ? (
                      <Select value={itemForm.status} onValueChange={v => setItemForm({...itemForm, status: v})}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
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
                    ) : (
                      <div className="font-medium">{item.status}</div>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-muted-foreground">Priority</Label>
                    {editMode ? (
                      <Input value={itemForm.priority} onChange={e => setItemForm({...itemForm, priority: e.target.value})} />
                    ) : (
                      <div className="font-medium">{item.priority || "-"}</div>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-muted-foreground">Warehouse Loc</Label>
                    {editMode ? (
                      <Input value={itemForm.warehouseLocation} onChange={e => setItemForm({...itemForm, warehouseLocation: e.target.value})} />
                    ) : (
                      <div className="font-medium">{item.warehouseLocation || "-"}</div>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-muted-foreground">Carrier Ref</Label>
                    {editMode ? (
                      <Input value={itemForm.carrierRef} onChange={e => setItemForm({...itemForm, carrierRef: e.target.value})} />
                    ) : (
                      <div className="font-medium">{item.carrierRef || "-"}</div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle>Inventory Levels</CardTitle>
                <CardDescription>Quantities and thresholds</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-muted-foreground">Qty On Hand</Label>
                    {editMode ? (
                      <Input type="number" value={itemForm.quantityOnHand} onChange={e => setItemForm({...itemForm, quantityOnHand: Number(e.target.value)})} />
                    ) : (
                      <div className="text-2xl font-bold font-mono">{item.quantityOnHand}</div>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-muted-foreground">Qty Requested</Label>
                    {editMode ? (
                      <Input type="number" value={itemForm.quantityRequested} onChange={e => setItemForm({...itemForm, quantityRequested: Number(e.target.value)})} />
                    ) : (
                      <div className="text-2xl font-bold font-mono">{item.quantityRequested}</div>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-muted-foreground">Reorder Point</Label>
                    {editMode ? (
                      <Input type="number" value={itemForm.reorderPoint} onChange={e => setItemForm({...itemForm, reorderPoint: Number(e.target.value)})} />
                    ) : (
                      <div className="text-lg font-semibold font-mono text-muted-foreground">{item.reorderPoint}</div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="md:col-span-2">
              <CardHeader className="pb-3">
                <CardTitle>Stakeholders</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-6 md:grid-cols-3">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-muted rounded"><Building2 className="h-4 w-4" /></div>
                  <div>
                    <div className="text-sm font-medium">Warehouse</div>
                    <div className="text-sm text-muted-foreground">{item.warehouseName || "-"}</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-muted rounded"><Truck className="h-4 w-4" /></div>
                  <div>
                    <div className="text-sm font-medium">Supplier</div>
                    <div className="text-sm text-muted-foreground">{item.supplierName || "-"}</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-muted rounded"><Package className="h-4 w-4" /></div>
                  <div>
                    <div className="text-sm font-medium">Client</div>
                    <div className="text-sm text-muted-foreground">{item.clientName || "-"}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="packaging" className="space-y-6">
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <div>
                <CardTitle>Packaging Specifications</CardTitle>
                <CardDescription>Physical dimensions and handling requirements</CardDescription>
              </div>
              {isWritable && !packEditMode && (
                <Button variant="outline" size="sm" onClick={handleEditPackaging}>Edit Specs</Button>
              )}
              {isWritable && packEditMode && (
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setPackEditMode(false)}>Cancel</Button>
                  <Button size="sm" onClick={handleSavePackaging} disabled={updatePackaging.isPending}>
                    {updatePackaging.isPending ? <Save className="h-4 w-4 mr-2 animate-pulse" /> : <Save className="h-4 w-4 mr-2" />}
                    Save
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent className="space-y-8">
              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-4">
                  <h4 className="font-semibold flex items-center gap-2"><Box className="h-4 w-4" /> Package Dimensions</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label className="text-muted-foreground">Length</Label>
                      {packEditMode ? <Input type="number" value={packForm.packageLength || ""} onChange={e => setPackForm({...packForm, packageLength: Number(e.target.value)})} /> : <div className="font-medium">{packaging.packageLength || "-"}</div>}
                    </div>
                    <div className="space-y-1">
                      <Label className="text-muted-foreground">Width</Label>
                      {packEditMode ? <Input type="number" value={packForm.packageWidth || ""} onChange={e => setPackForm({...packForm, packageWidth: Number(e.target.value)})} /> : <div className="font-medium">{packaging.packageWidth || "-"}</div>}
                    </div>
                    <div className="space-y-1">
                      <Label className="text-muted-foreground">Height</Label>
                      {packEditMode ? <Input type="number" value={packForm.packageHeight || ""} onChange={e => setPackForm({...packForm, packageHeight: Number(e.target.value)})} /> : <div className="font-medium">{packaging.packageHeight || "-"}</div>}
                    </div>
                    <div className="space-y-1">
                      <Label className="text-muted-foreground">Weight</Label>
                      {packEditMode ? <Input type="number" value={packForm.packageWeight || ""} onChange={e => setPackForm({...packForm, packageWeight: Number(e.target.value)})} /> : <div className="font-medium">{packaging.packageWeight || "-"}</div>}
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="font-semibold flex items-center gap-2"><Truck className="h-4 w-4" /> Pallet Dimensions</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label className="text-muted-foreground">Length</Label>
                      {packEditMode ? <Input type="number" value={packForm.palletLength || ""} onChange={e => setPackForm({...packForm, palletLength: Number(e.target.value)})} /> : <div className="font-medium">{packaging.palletLength || "-"}</div>}
                    </div>
                    <div className="space-y-1">
                      <Label className="text-muted-foreground">Width</Label>
                      {packEditMode ? <Input type="number" value={packForm.palletWidth || ""} onChange={e => setPackForm({...packForm, palletWidth: Number(e.target.value)})} /> : <div className="font-medium">{packaging.palletWidth || "-"}</div>}
                    </div>
                    <div className="space-y-1">
                      <Label className="text-muted-foreground">Height</Label>
                      {packEditMode ? <Input type="number" value={packForm.palletHeight || ""} onChange={e => setPackForm({...packForm, palletHeight: Number(e.target.value)})} /> : <div className="font-medium">{packaging.palletHeight || "-"}</div>}
                    </div>
                    <div className="space-y-1">
                      <Label className="text-muted-foreground">Weight</Label>
                      {packEditMode ? <Input type="number" value={packForm.palletWeight || ""} onChange={e => setPackForm({...packForm, palletWeight: Number(e.target.value)})} /> : <div className="font-medium">{packaging.palletWeight || "-"}</div>}
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 pt-4 border-t">
                <div className="flex items-center justify-between">
                  <Label className="flex flex-col"><span className="font-medium">Stackable</span><span className="text-xs text-muted-foreground">Can be stacked</span></Label>
                  {packEditMode ? <Switch checked={packForm.stackable} onCheckedChange={c => setPackForm({...packForm, stackable: c})} /> : <Badge variant={packaging.stackable ? "default" : "secondary"}>{packaging.stackable ? "Yes" : "No"}</Badge>}
                </div>
                <div className="flex items-center justify-between">
                  <Label className="flex flex-col"><span className="font-medium">Fragile</span><span className="text-xs text-muted-foreground">Handle with care</span></Label>
                  {packEditMode ? <Switch checked={packForm.fragile} onCheckedChange={c => setPackForm({...packForm, fragile: c})} /> : <Badge variant={packaging.fragile ? "default" : "secondary"}>{packaging.fragile ? "Yes" : "No"}</Badge>}
                </div>
                <div className="flex items-center justify-between">
                  <Label className="flex flex-col"><span className="font-medium">Hazmat</span><span className="text-xs text-muted-foreground">Hazardous material</span></Label>
                  {packEditMode ? <Switch checked={packForm.hazmatFlag} onCheckedChange={c => setPackForm({...packForm, hazmatFlag: c})} /> : <Badge variant={packaging.hazmatFlag ? "destructive" : "secondary"}>{packaging.hazmatFlag ? "Yes" : "No"}</Badge>}
                </div>
                <div className="flex items-center justify-between">
                  <Label className="flex flex-col"><span className="font-medium">Temp Control</span><span className="text-xs text-muted-foreground">Requires cooling</span></Label>
                  {packEditMode ? <Switch checked={packForm.temperatureControlRequired} onCheckedChange={c => setPackForm({...packForm, temperatureControlRequired: c})} /> : <Badge variant={packaging.temperatureControlRequired ? "default" : "secondary"}>{packaging.temperatureControlRequired ? "Yes" : "No"}</Badge>}
                </div>
              </div>

              <div className="pt-4 border-t space-y-4">
                <h4 className="font-semibold">Handling Notes</h4>
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-1">
                    <Label className="text-muted-foreground">Client Notes</Label>
                    {packEditMode ? <Textarea value={packForm.clientPackagingNotes || ""} onChange={e => setPackForm({...packForm, clientPackagingNotes: e.target.value})} /> : <div className="text-sm bg-muted/50 p-3 rounded-md min-h-[80px]">{packaging.clientPackagingNotes || "No notes"}</div>}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-muted-foreground">Supplier Notes</Label>
                    {packEditMode ? <Textarea value={packForm.supplierComplianceNotes || ""} onChange={e => setPackForm({...packForm, supplierComplianceNotes: e.target.value})} /> : <div className="text-sm bg-muted/50 p-3 rounded-md min-h-[80px]">{packaging.supplierComplianceNotes || "No notes"}</div>}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-muted-foreground">Warehouse Notes</Label>
                    {packEditMode ? <Textarea value={packForm.warehouseHandlingNotes || ""} onChange={e => setPackForm({...packForm, warehouseHandlingNotes: e.target.value})} /> : <div className="text-sm bg-muted/50 p-3 rounded-md min-h-[80px]">{packaging.warehouseHandlingNotes || "No notes"}</div>}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notes" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-3">
            <div className="md:col-span-2 space-y-4">
              {loadingNotes ? (
                <div className="text-center p-8 text-muted-foreground">Loading notes...</div>
              ) : notesList?.length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center text-muted-foreground">
                    <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-20" />
                    <p>No notes have been added yet.</p>
                  </CardContent>
                </Card>
              ) : (
                notesList?.map(note => (
                  <Card key={note.id}>
                    <CardHeader className="pb-3 pt-4 px-4 flex flex-row items-start justify-between bg-muted/20">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm">{note.authorName}</span>
                          <Badge variant="outline" className="text-[10px] uppercase">{note.authorRole}</Badge>
                        </div>
                        <span className="text-xs text-muted-foreground">{format(new Date(note.createdAt), "MMM d, yyyy 'at' h:mm a")}</span>
                      </div>
                      <div className="flex gap-2">
                        <Badge variant="secondary" className="text-xs">{note.category}</Badge>
                        <Badge variant="outline" className="text-xs">{note.visibility}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="p-4 text-sm whitespace-pre-wrap">
                      {note.body}
                    </CardContent>
                  </Card>
                ))
              )}
            </div>

            {userRole !== 'auditor' && (
              <Card className="h-fit sticky top-4">
                <CardHeader>
                  <CardTitle>Add Note</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Visibility</Label>
                    <Select value={noteVisibility} onValueChange={setNoteVisibility}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {visibilityOptions.map(opt => (
                          <SelectItem key={opt} value={opt} className="capitalize">{opt.replace('_', ' ')}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Category</Label>
                    <Select value={noteCategory} onValueChange={setNoteCategory}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["general", "packaging", "handling", "loading", "shipment", "supplier_action", "client_request", "quarterly_plan"].map(cat => (
                          <SelectItem key={cat} value={cat} className="capitalize">{cat.replace('_', ' ')}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Message</Label>
                    <Textarea 
                      rows={4} 
                      value={noteBody} 
                      onChange={e => setNoteBody(e.target.value)} 
                      placeholder="Write your note here..."
                    />
                  </div>
                  <Button className="w-full" onClick={handlePostNote} disabled={!noteBody.trim() || createNote.isPending}>
                    {createNote.isPending ? "Posting..." : "Post Note"}
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="exceptions" className="space-y-4">
          {exceptions.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center flex flex-col items-center">
                <Check className="h-12 w-12 text-green-500 mb-4 opacity-50" />
                <h3 className="text-lg font-medium">No Exceptions</h3>
                <p className="text-muted-foreground mt-1">This item meets all compliance requirements.</p>
              </CardContent>
            </Card>
          ) : (
            exceptions.map(exception => (
              <Card key={exception.id} className="overflow-hidden">
                <div className={`h-1 w-full ${exception.severity === 'critical' ? 'bg-destructive' : exception.severity === 'high' ? 'bg-orange-500' : exception.severity === 'medium' ? 'bg-amber-500' : 'bg-blue-500'}`} />
                <CardContent className="p-4 sm:p-6">
                  <div className="flex gap-4 items-start">
                    <div className="mt-1">{getSeverityIcon(exception.severity)}</div>
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
                      <h3 className="font-semibold">{exception.message}</h3>
                      <div className="text-sm text-muted-foreground mt-2 capitalize">
                        Category: {exception.category.replace('_', ' ')}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle>Audit History</CardTitle>
              <CardDescription>Timeline of changes for this item</CardDescription>
            </CardHeader>
            <CardContent>
              {history.length === 0 ? (
                <div className="text-center p-8 text-muted-foreground">No history available.</div>
              ) : (
                <div className="relative border-l ml-3 pl-6 space-y-8 py-2">
                  {history.map((entry, i) => (
                    <div key={entry.id} className="relative">
                      <div className="absolute -left-[31px] top-1 h-3 w-3 rounded-full bg-border ring-4 ring-background" />
                      <div className="flex flex-col gap-1">
                        <div className="text-sm text-muted-foreground flex justify-between items-center">
                          <span>{format(new Date(entry.createdAt), "MMM d, yyyy HH:mm")}</span>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-foreground">{entry.actorName || 'System'}</span>
                            {entry.actorRole && <Badge variant="outline" className="text-[10px] uppercase">{entry.actorRole}</Badge>}
                          </div>
                        </div>
                        <div className="font-medium">
                          {entry.action} {entry.field && <span className="text-muted-foreground font-normal">on {entry.field}</span>}
                        </div>
                        {(entry.oldValue || entry.newValue) && (
                          <div className="text-sm font-mono bg-muted/50 p-2 rounded flex gap-2 items-center mt-1 w-fit max-w-full">
                            <span className="text-muted-foreground truncate">{entry.oldValue || 'null'}</span>
                            <span className="text-muted-foreground">→</span>
                            <span className="font-medium truncate">{entry.newValue || 'null'}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
