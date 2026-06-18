import { useListAuditLogs } from "@workspace/api-client-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { ArrowRight } from "lucide-react";

export default function AuditLog() {
  const { data: logs, isLoading } = useListAuditLogs({ limit: 200 });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Audit Log</h1>
        <p className="text-muted-foreground mt-1">System-wide activity and changes</p>
      </div>

      <div className="bg-card rounded-lg border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[180px]">Timestamp</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Record</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center">Loading audit logs...</TableCell>
                </TableRow>
              ) : logs?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">No audit logs found</TableCell>
                </TableRow>
              ) : (
                logs?.map((log) => (
                  <TableRow key={log.id} className="text-sm">
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {format(new Date(log.createdAt), "MMM d, yyyy HH:mm")}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{log.actorName || "System"}</div>
                      {log.actorRole && (
                        <div className="text-xs text-muted-foreground capitalize">{log.actorRole.replace('_', ' ')}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Badge variant="outline" className="w-fit text-xs capitalize">{log.recordType}</Badge>
                        {log.itemSku && <span className="font-mono text-xs">{log.itemSku}</span>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">{log.action}</span>
                      {log.field && <span className="text-muted-foreground ml-1">({log.field})</span>}
                    </TableCell>
                    <TableCell className="max-w-[300px]">
                      {(log.oldValue || log.newValue) ? (
                        <div className="flex items-center gap-2 text-xs font-mono bg-muted/50 p-2 rounded">
                          <span className="truncate max-w-[120px] opacity-70" title={log.oldValue || "empty"}>
                            {log.oldValue || "null"}
                          </span>
                          <ArrowRight className="h-3 w-3 flex-shrink-0" />
                          <span className="truncate max-w-[120px] font-semibold" title={log.newValue || "empty"}>
                            {log.newValue || "null"}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground italic">-</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
