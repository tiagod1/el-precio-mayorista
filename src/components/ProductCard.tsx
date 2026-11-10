import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Check, ImageOff, Minus, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { isAvailable, photoSrc, type Product } from "@/lib/catalog";
import { useCart } from "@/lib/cart";
import { useReveal } from "@/lib/reveal";
import { formatARS } from "@/lib/import-rules";
import { promoDiscountPercent, promoPrice, type Promotion } from "@/lib/promotions";

export function ProductCard({ p, index, promo }: { p: Product; index: number; promo?: Promotion | undefined }) {
  const cart = useCart();
  const ref = useReveal<HTMLLIElement>();
  const ok = isAvailable(p);
  const inCart = cart.items.find((i) => i.codigo === p.codigo);
  const src = photoSrc(p.foto_url);
  const [added, setAdded] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unitPrice = promo ? promoPrice(p.precio, promo) : p.precio;
  const discountPct = promo ? promoDiscountPercent(p.precio, unitPrice) : 0;
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function add() {
    cart.add({ codigo: p.codigo, nombre: p.nombre, precio: p.precio });
    toast.success("Agregado al pedido");
    setAdded((n) => n + 1);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setAdded(0), 900);
  }

  return (
    <li ref={ref} className="reveal" style={{ "--i": index } as CSSProperties}>
      <article className={`product-card flex h-full flex-col overflow-hidden rounded-xl border bg-card shadow-card ${inCart ? "border-primary/40" : ""}`}>
        <div className="relative aspect-square overflow-hidden bg-muted">
          {src ? (
            <img src={src} alt={p.nombre} loading="lazy" decoding="async" className={`product-img h-full w-full object-contain p-2 ${ok ? "" : "opacity-60 grayscale"}`} />
          ) : (
            <div className="grid h-full place-items-center text-muted-foreground/50"><ImageOff className="h-8 w-8" aria-hidden /></div>
          )}
          <span className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase shadow-sm ${ok ? "bg-success text-success-foreground" : "bg-destructive text-destructive-foreground"}`}>
            {ok ? "En stock" : "Sin stock"}
          </span>
          {promo && (
            <span className="absolute bottom-2 left-2 rounded-full bg-highlight px-2 py-0.5 text-[10px] font-black uppercase text-highlight-foreground shadow-sm">
              -{discountPct}%
            </span>
          )}
          {inCart && (
            <span key={inCart.qty} className="anim-pop absolute right-2 top-2 grid h-6 min-w-6 place-items-center rounded-full bg-primary px-1.5 text-[11px] font-black text-primary-foreground shadow-sm" aria-label={`${inCart.qty} en el pedido`}>
              {inCart.qty}
            </span>
          )}
          {added > 0 && (
            <span key={added} className="anim-check pointer-events-none absolute inset-0 grid place-items-center" aria-hidden>
              <span className="grid h-14 w-14 place-items-center rounded-full bg-highlight text-highlight-foreground shadow-card-hover">
                <Check className="h-7 w-7" strokeWidth={3} />
              </span>
            </span>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-1 p-2.5 sm:p-3">
          <p className="truncate text-[11px] text-muted-foreground">Cód. {p.codigo}{p.proveedor ? ` · ${p.proveedor}` : ""}</p>
          <h3 className="line-clamp-3 font-sans text-sm font-semibold leading-snug">{p.nombre}</h3>
          <div className="mt-auto pt-1.5">
            <span className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Precio unitario</span>
            {promo ? (
              <div className="mt-0.5">
                <p className="text-xs text-muted-foreground line-through">{formatARS(p.precio)}</p>
                <p className="price-tag inline-flex items-baseline rounded-md bg-highlight px-2 py-0.5 font-display text-lg font-black leading-tight text-highlight-foreground sm:text-xl">
                  {formatARS(unitPrice)}
                </p>
              </div>
            ) : (
              <p className="price-tag mt-0.5 inline-flex items-baseline rounded-md bg-highlight px-2 py-0.5 font-display text-lg font-black leading-tight text-highlight-foreground sm:text-xl">
                {formatARS(p.precio)}
              </p>
            )}
          </div>
          <div className="mt-1.5">
            {inCart ? (
              <div className="anim-pop"><QtyControl codigo={p.codigo} qty={inCart.qty} /></div>
            ) : (
              <Button
                size="sm"
                className="h-10 w-full rounded-lg transition-transform duration-150 active:scale-95"
                disabled={!ok}
                onClick={add}
              >
                {ok ? <><Plus className="h-4 w-4" /> Agregar</> : "No disponible"}
              </Button>
            )}
          </div>
        </div>
      </article>
    </li>
  );
}

export function QtyControl({ codigo, qty }: { codigo: string; qty: number }) {
  const cart = useCart();
  return (
    <div className="flex h-10 items-center justify-between rounded-lg border bg-secondary">
      <button className="grid h-full w-10 place-items-center rounded-l-lg transition-colors hover:bg-muted active:scale-90" onClick={() => cart.setQty(codigo, qty - 1)} aria-label="Restar uno"><Minus className="h-4 w-4" /></button>
      <input
        type="number" inputMode="numeric" min={0} value={qty}
        onChange={(e) => cart.setQty(codigo, Math.max(0, parseInt(e.target.value || "0", 10)))}
        className="no-spin w-12 bg-transparent text-center text-base font-bold outline-none"
        aria-label="Cantidad"
      />
      <button className="grid h-full w-10 place-items-center rounded-r-lg transition-colors hover:bg-muted active:scale-90" onClick={() => cart.setQty(codigo, qty + 1)} aria-label="Sumar uno"><Plus className="h-4 w-4" /></button>
    </div>
  );
}
