import { useMemo, useState } from "react";
import { toast } from "sonner";
import { History, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatDate, isAvailable, type Product } from "@/lib/catalog";
import { useCart } from "@/lib/cart";
import { fetchCustomerOrderHistory, getStoredCustomerToken, normalizePhone, type CustomerOrder } from "@/lib/orders";
import { formatARS } from "@/lib/import-rules";

export function RepeatOrderDialog({
  open,
  onOpenChange,
  products,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: Product[];
}) {
  const cart = useCart();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [token, setToken] = useState("");
  const [orders, setOrders] = useState<CustomerOrder[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const productByCodigo = useMemo(() => new Map(products.map((p) => [p.codigo, p])), [products]);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    const digits = normalizePhone(phone);
    if (name.trim().length < 2) return setError("Ingresá el nombre usado en el pedido.");
    if (digits.length < 8 || digits.length > 15) return setError("Ingresá un WhatsApp válido, solo números.");
    const accessToken = token.trim() || getStoredCustomerToken(digits, name);
    if (accessToken.length < 16) return setError("Ingresá tu código de cliente para ver pedidos anteriores.");
    setLoading(true);
    setError(null);
    try {
      setOrders(await fetchCustomerOrderHistory(name, digits, accessToken));
    } catch {
      setOrders(null);
      setError("No se pudieron consultar los pedidos. Verificá los datos e intentá de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  function load(order: CustomerOrder) {
    const warnings: string[] = [];
    const toAdd = order.items.flatMap((item) => {
      const p = productByCodigo.get(item.codigo);
      if (!p || p.oculto || !isAvailable(p)) {
        warnings.push(`${item.nombre} ya no está disponible`);
        return [];
      }
      const qty = Math.min(item.qty, p.stock);
      if (qty < item.qty) warnings.push(`${item.nombre}: stock actual ${p.stock}`);
      return qty > 0 ? [{ codigo: p.codigo, nombre: p.nombre, precio: p.precio, qty }] : [];
    });
    if (!toAdd.length) {
      toast.error("Ningún producto de ese pedido sigue disponible.");
      return;
    }
    cart.clear();
    for (const item of toAdd) cart.add({ codigo: item.codigo, nombre: item.nombre, precio: item.precio }, item.qty);
    if (warnings.length) {
      toast(`Pedido cargado con avisos: ${warnings.join("; ")}`);
    } else {
      toast.success("Pedido cargado con precios y stock actuales.");
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><History className="h-5 w-5 text-primary" /> Repetir pedido</DialogTitle>
          <DialogDescription>Ingresá el nombre y WhatsApp usados en un pedido confirmado para cargarlo con precios y stock actuales.</DialogDescription>
        </DialogHeader>
        <form onSubmit={search} className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="repeat-name">Nombre</Label>
            <Input id="repeat-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre del pedido" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="repeat-phone">WhatsApp</Label>
            <Input id="repeat-phone" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Ej: 5491112345678" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="repeat-token">Código de cliente</Label>
            <Input id="repeat-token" value={token} onChange={(e) => setToken(e.target.value)} placeholder="Pegá el código que te dimos al pedir" className="font-mono text-xs" />
            <p className="text-[11px] text-muted-foreground">Si ya pediste desde este dispositivo, se usa el código guardado automáticamente.</p>
          </div>
          <div className="flex items-end sm:col-span-2">
            <Button type="submit" disabled={loading} className="h-10 w-full sm:w-auto">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Buscar"}
            </Button>
          </div>
        </form>
        {error && <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
        {orders && (
          <div className="space-y-3">
            {orders.length === 0 ? (
              <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">No encontramos pedidos confirmados para esos datos.</p>
            ) : (
              orders.map((order) => (
                <div key={order.id} className="rounded-xl border bg-card p-4 shadow-card">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold">{formatDate(order.created_at)}</p>
                      <p className="text-xs text-muted-foreground">{order.items.length} productos · {order.items.reduce((s, i) => s + i.qty, 0)} unidades</p>
                    </div>
                    <div className="text-right">
                      <p className="font-black">{formatARS(order.total)}</p>
                      <Button size="sm" className="mt-2" onClick={() => load(order)}>Cargar pedido</Button>
                    </div>
                  </div>
                  <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                    {order.items.slice(0, 4).map((i) => `${i.qty} x ${i.nombre}`).join(" · ")}
                    {order.items.length > 4 ? ` · +${order.items.length - 4} más` : ""}
                  </p>
                </div>
              ))
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
