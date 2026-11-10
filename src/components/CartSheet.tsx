import { useMemo, useState, type CSSProperties } from "react";
import { toast } from "sonner";
import { Loader2, MessageCircle, ShoppingCart, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { Product } from "@/lib/catalog";
import { useCart } from "@/lib/cart";
import { buildWhatsAppMessage, formatARS, whatsappDigits } from "@/lib/import-rules";
import { priceCartItems, type Promotion } from "@/lib/promotions";
import { createPendingOrder, getStoredCustomerToken, storeCustomerToken } from "@/lib/orders";
import { QtyControl } from "@/components/ProductCard";

export function CartSheet({
  open,
  onOpenChange,
  whatsapp,
  products,
  promotions,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  whatsapp: string | null;
  products: Product[];
  promotions: Promotion[];
}) {
  const cart = useCart();
  const phone = whatsappDigits(whatsapp);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [sending, setSending] = useState(false);
  const [issuedToken, setIssuedToken] = useState("");
  const priced = useMemo(() => priceCartItems(cart.items, products, promotions), [cart.items, products, promotions]);
  const baseTotal = priced.reduce((s, i) => s + i.qty * i.precioBase, 0);
  const total = priced.reduce((s, i) => s + i.qty * i.precioUnitario, 0);
  const ahorro = priced.reduce((s, i) => s + i.qty * i.ahorroUnitario, 0);
  const hasUnavailable = priced.some((i) => !i.disponible);

  async function send() {
    if (!phone) { toast.error("El número de WhatsApp todavía no fue configurado por el comercio."); return; }
    const name = customerName.trim();
    const digits = customerPhone.replace(/\D/g, "");
    if (name.length < 2) { toast.error("Ingresá tu nombre para registrar el pedido."); return; }
    if (digits.length < 8 || digits.length > 15) { toast.error("Ingresá un WhatsApp válido, solo números."); return; }
    const payload = priced.filter((i) => i.productId).map((i) => ({
      product_id: i.productId as string,
      promotion_id: i.promotionId,
      codigo: i.codigo,
      nombre: i.nombre,
      qty: i.qty,
      precio_base: i.precioBase,
      precio_unitario: i.precioUnitario,
    }));
    if (!payload.length) { toast.error("No hay productos válidos para registrar el pedido."); return; }
    setSending(true);
    try {
      const stored = getStoredCustomerToken(digits, name);
      const created = await createPendingOrder(name, digits, payload, stored);
      storeCustomerToken(digits, name, created.access_token);
      setIssuedToken(created.access_token);
      toast.success("Pedido registrado. Guardá tu código de cliente para repetir pedidos.");
    } catch {
      toast.error("No se pudo registrar el pedido; se enviará igual por WhatsApp.");
    }
    const text = `Hola El Precio Mayorista, soy ${name}. Mi WhatsApp es ${digits}.\n\n${buildWhatsAppMessage(priced)}`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, "_blank", "noopener");
    setSending(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 [&>button:first-child]:text-primary-foreground [&>button:first-child]:opacity-90 ease-[cubic-bezier(0.22,0.8,0.24,1)] data-[state=closed]:duration-200 data-[state=open]:duration-300 sm:max-w-md"
      >
        <SheetHeader className="border-b bg-header p-4 text-primary-foreground">
          <SheetTitle className="flex items-center gap-2 text-primary-foreground">
            <ShoppingCart className="h-5 w-5 text-highlight" /> Tu pedido
            {cart.count > 0 && <span className="rounded-full bg-highlight px-2 py-0.5 text-xs font-black text-highlight-foreground">{cart.count} u.</span>}
          </SheetTitle>
        </SheetHeader>
        {priced.length === 0 ? (
          <div className="grid flex-1 place-items-center p-6 text-center text-muted-foreground">
            <div className="anim-fade-up">
              <ShoppingCart className="mx-auto h-10 w-10 opacity-30" />
              <p className="mt-3">Todavía no agregaste productos.</p>
            </div>
          </div>
        ) : (
          <ul className="flex-1 divide-y overflow-y-auto overscroll-contain">
            {priced.map((it, i) => (
              <li key={it.codigo} className="anim-fade-up flex gap-3 p-4" style={{ "--i": Math.min(i, 8) } as CSSProperties}>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold leading-snug">{it.nombre}</p>
                  <p className="text-xs text-muted-foreground">Cód. {it.codigo}</p>
                  {it.ahorroUnitario > 0 && (
                    <p className="mt-0.5 text-xs">
                      <span className="text-muted-foreground line-through">{formatARS(it.precioBase)} c/u</span>{" "}
                      <span className="font-bold text-highlight-foreground">{formatARS(it.precioUnitario)} c/u</span>
                      <span className="ml-1 text-[11px] font-semibold text-success">-{it.descuentoPct}%</span>
                    </p>
                  )}
                  {it.ahorroUnitario === 0 && <p className="text-xs text-muted-foreground">{formatARS(it.precioUnitario)} c/u</p>}
                  {!it.disponible && <p className="mt-1 text-xs font-semibold text-destructive">Ya no está disponible</p>}
                  <div className="mt-2 w-36"><QtyControl codigo={it.codigo} qty={it.qty} /></div>
                </div>
                <div className="flex flex-col items-end justify-between">
                  <button onClick={() => cart.remove(it.codigo)} className="rounded p-1.5 text-muted-foreground transition-colors hover:text-destructive" aria-label={`Quitar ${it.nombre}`}><Trash2 className="h-4 w-4" /></button>
                  <p key={it.qty} className="anim-pop font-bold">{formatARS(it.qty * it.precioUnitario)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="space-y-3 border-t bg-card p-4 pb-safe">
          {cart.items.length > 0 && (
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="cart-name">Tu nombre</Label>
                <Input id="cart-name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Nombre para el pedido" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cart-phone">Tu WhatsApp</Label>
                <Input id="cart-phone" inputMode="tel" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="Ej: 5491112345678" />
              </div>
            </div>
          )}
          {issuedToken && (
            <div className="rounded-lg border bg-secondary/60 p-3 text-xs">
              <p className="font-semibold">Tu código de cliente (guardalo para repetir pedidos):</p>
              <p className="mt-1 break-all font-mono text-[11px]">{issuedToken}</p>
            </div>
          )}
          {ahorro > 0 && <div className="flex justify-between text-sm"><span>Ahorras con ofertas</span><span className="font-bold text-success">-{formatARS(ahorro)}</span></div>}
          <div className="flex justify-between text-sm"><span>Subtotal ({cart.count} u.)</span><span>{formatARS(baseTotal)}</span></div>
          <div className="flex justify-between text-lg font-black"><span>Total estimado</span><span key={total} className="anim-pop text-primary">{formatARS(total)}</span></div>
          <p className="text-xs text-muted-foreground">Precios sujetos a confirmación por el comercio.</p>
          {hasUnavailable && <p className="text-xs font-semibold text-destructive">Hay productos no disponibles. Quitalos para continuar.</p>}
          <Button variant="whatsapp" className="h-12 w-full rounded-xl text-base transition-transform active:scale-[0.98]" disabled={priced.length === 0 || hasUnavailable || sending} onClick={send}>
            {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <MessageCircle className="h-5 w-5" />} Enviar pedido por WhatsApp
          </Button>
          {cart.items.length > 0 && (
            <button onClick={() => cart.clear()} className="flex w-full items-center justify-center gap-1 py-1 text-xs text-muted-foreground hover:text-destructive"><X className="h-3 w-3" /> Vaciar pedido</button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
