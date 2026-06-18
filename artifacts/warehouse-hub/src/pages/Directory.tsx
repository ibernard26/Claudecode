import { useListClients, useListSuppliers, useListWarehouses } from "@workspace/api-client-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Building2, Truck, Users } from "lucide-react";

export default function Directory() {
  const { data: clients, isLoading: loadingClients } = useListClients();
  const { data: suppliers, isLoading: loadingSuppliers } = useListSuppliers();
  const { data: warehouses, isLoading: loadingWarehouses } = useListWarehouses();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Directory</h1>
        <p className="text-muted-foreground mt-1">Partners, facilities, and organizations</p>
      </div>

      <Tabs defaultValue="clients" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="clients" className="flex gap-2">
            <Users className="h-4 w-4" /> Clients
          </TabsTrigger>
          <TabsTrigger value="suppliers" className="flex gap-2">
            <Truck className="h-4 w-4" /> Suppliers
          </TabsTrigger>
          <TabsTrigger value="warehouses" className="flex gap-2">
            <Building2 className="h-4 w-4" /> Warehouses
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="clients">
          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">ID</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingClients ? (
                  <TableRow><TableCell colSpan={3} className="text-center h-24">Loading...</TableCell></TableRow>
                ) : (
                  clients?.map((client) => (
                    <TableRow key={client.id}>
                      <TableCell className="font-mono text-muted-foreground">{client.id}</TableCell>
                      <TableCell className="font-mono">{client.code}</TableCell>
                      <TableCell className="font-medium">{client.name}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="suppliers">
          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">ID</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingSuppliers ? (
                  <TableRow><TableCell colSpan={3} className="text-center h-24">Loading...</TableCell></TableRow>
                ) : (
                  suppliers?.map((supplier) => (
                    <TableRow key={supplier.id}>
                      <TableCell className="font-mono text-muted-foreground">{supplier.id}</TableCell>
                      <TableCell className="font-mono">{supplier.code}</TableCell>
                      <TableCell className="font-medium">{supplier.name}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="warehouses">
          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">ID</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Location</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingWarehouses ? (
                  <TableRow><TableCell colSpan={4} className="text-center h-24">Loading...</TableCell></TableRow>
                ) : (
                  warehouses?.map((warehouse) => (
                    <TableRow key={warehouse.id}>
                      <TableCell className="font-mono text-muted-foreground">{warehouse.id}</TableCell>
                      <TableCell className="font-mono">{warehouse.code}</TableCell>
                      <TableCell className="font-medium">{warehouse.name}</TableCell>
                      <TableCell className="text-muted-foreground">{warehouse.location || "-"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
