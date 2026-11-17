import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatDate } from "@/lib/catalog";
import { formatARS } from "@/lib/import-rules";
import { cancelOrder, confirmOrder } from "@/lib/orders";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type OrderRow = {
  id: string;
  customer_name: string;
  customer_phone: string;
  customer_number: string | null;
  delivery_address: string | null;
  status: "pending" | "confirmed" | "cancelled";
  total: number;
  created_at: string;
  confirmed_at: string | null;
  notes: string | null;
};

type ItemRow = {
  id: string;
  order_id: string;
  codigo: string;
  nombre: string;
  qty: number;
  precio_unitario: number;
  line_total: number;
};

const statusLabel = { pending: "Pendiente", confirmed: "Confirmado", cancelled: "Cancelado" } as const;

export function OrdersSection() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<"all" | OrderRow["status"]>("all");
  const [cancelTarget, setCancelTarget] = useState<OrderRow | null>(null);
  const orders = useQuery({
    queryKey: ["admin-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id,customer_name,customer_phone,customer_number,delivery_address,status,total,created_at,confirmed_at,notes")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as OrderRow[];
    },
  });
  const ids = useMemo(() => (orders.data ?? []).map((o) => o.id), [orders.data]);
  const items = useQuery({
    queryKey: ["admin-order-items", ids.join(",")],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_items")
        .select("id,order_id,codigo,nombre,qty,precio_unitario,line_total")
        .in("order_id", ids);
      if (error) throw error;
      return (data ?? []) as ItemRow[];
    },
  });
  const itemsByOrder = useMemo(() => {
    const map = new Map<string, ItemRow[]>();
    for (const item of items.data ?? []) map.set(item.order_id, [...(map.get(item.order_id) ?? []), item]);
    return map;
  }, [items.data]);
  const list = useMemo(
    () => (orders.data ?? []).filter((o) => status === "all" || o.status === status),
    [orders.data, status],
  );

  async function applyStatus(order: OrderRow, next: OrderRow["status"], restock = false) {
    try {
      if (next === "confirmed") await confirmOrder(order.id);
      else await cancelOrder(order.id, restock);
      toast.success(
        next === "confirmed"
          ? "Pedido confirmado y stock descontado."
          : restock
            ? "Pedido cancelado y stock repuesto."
            : "Pedido cancelado.",
      );
      qc.invalidateQueries({ queryKey: ["admin-orders"] });
      qc.invalidateQueries({ queryKey: ["products"] });
    } catch (e) {
      toast.error(`No se pudo actualizar: ${e instanceof Error ? e.message : "error desconocido"}`);
    }
  }

  function setOrderStatus(order: OrderRow, next: OrderRow["status"]) {
    if (next === "cancelled" && order.status === "confirmed") {
      setCancelTarget(order);
      return;
    }
    void applyStatus(order, next);
  }

  function confirmCancel(restock: boolean) {
    const order = cancelTarget;
    setCancelTarget(null);
    if (order) void applyStatus(order, "cancelled", restock);
  }

  return (
    <section className="rounded-xl border bg-card p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-black">Pedidos</h2>
          <p className="mt-1 text-sm text-muted-foreground">Confirmá solo ventas reales. Las estadísticas y el ranking cuentan únicamente pedidos confirmados.</p>
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
          <SelectTrigger className="h-10 w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="pending">Pendientes</SelectItem>
            <SelectItem value="confirmed">Confirmados</SelectItem>
            <SelectItem value="cancelled">Cancelados</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {orders.isError ? (
        <p className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">No se pudieron cargar los pedidos. Verificá que la migración de base de datos esté aplicada.</p>
      ) : orders.isLoading ? (
        <p className="mt-4 text-sm text-muted-foreground">Cargando pedidos…</p>
      ) : list.length === 0 ? (
        <p className="mt-4 rounded-lg border bg-secondary/50 p-4 text-sm text-muted-foreground">No hay pedidos para este filtro.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {list.map((order) => (
            <li key={order.id} className="rounded-xl border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold">{order.customer_name}</p>
                  <p className="text-xs text-muted-foreground">WhatsApp {order.customer_phone} · {formatDate(order.created_at)}</p>
                  {(order.customer_number || order.delivery_address) && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {order.customer_number ? `Nº cliente ${order.customer_number}` : ""}
                      {order.customer_number && order.delivery_address ? " · " : ""}
                      {order.delivery_address ? `Entrega: ${order.delivery_address}` : ""}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase ${order.status === "confirmed" ? "bg-success/15 text-success" : order.status === "cancelled" ? "bg-destructive/15 text-destructive" : "bg-highlight/25 text-highlight-foreground"}`}>
                    {statusLabel[order.status]}
                  </span>
                  <p className="mt-1 font-black">{formatARS(order.total)}</p>
                </div>
              </div>
              <ul className="mt-3 divide-y text-sm">
                {(itemsByOrder.get(order.id) ?? []).map((item) => (
                  <li key={item.id} className="flex justify-between gap-3 py-1.5">
                    <span className="min-w-0"><span className="font-medium">{item.qty} x</span> {item.nombre} <span className="text-xs text-muted-foreground">({item.codigo})</span></span>
                    <span className="shrink-0 font-semibold">{formatARS(item.line_total)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex flex-wrap gap-2">
                {order.status === "pending" && (
                  <Button size="sm" onClick={() => setOrderStatus(order, "confirmed")}><CheckCircle2 className="h-4 w-4" /> Confirmar venta</Button>
                )}
                {order.status !== "cancelled" && (
                  <Button size="sm" variant="outline" onClick={() => setOrderStatus(order, "cancelled")}><XCircle className="h-4 w-4" /> Cancelar</Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <AlertDialog open={cancelTarget !== null} onOpenChange={(open) => !open && setCancelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar pedido confirmado</AlertDialogTitle>
            <AlertDialogDescription>
              Pedido de {cancelTarget?.customer_name} por {formatARS(cancelTarget?.total ?? 0)}.
              ¿La mercadería volvió a estar disponible para la venta?
              Si respondés que sí, el stock se repone; si no, el pedido se cancela sin modificar el stock.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Volver</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmCancel(false)}>No reponer stock</AlertDialogAction>
            <AlertDialogAction onClick={() => confirmCancel(true)}>Sí, reponer stock</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
