import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useDeferredValue, useMemo, useState } from "react";
import { Search, ShoppingCart, Minus, Plus, Trash2, PackageOpen, X, ImageOff, Lock } from "lucide-react";
import { toast } from "sonner";
import { Brand } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchAllProducts, fetchSettings, formatDate, isAvailable, normalizeText, photoSrc, type Product } from "@/lib/catalog";
import { useCart } from "@/lib/cart";
import { buildWhatsAppMessage, formatARS, whatsappDigits } from "@/lib/import-rules";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "El Precio Mayorista | Catálogo mayorista online" },
      { name: "description", content: "Consultá precios y stock del catálogo mayorista y armá tu pedido por WhatsApp." },
      { property: "og:title", content: "El Precio Mayorista | Catálogo mayorista" },
      { property: "og:description", content: "Precios y stock actualizados. Armá tu pedido y envialo por WhatsApp." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Catalog,
});

const PAGE = 48;

function Catalog() {
  const products = useQuery({ queryKey: ["products"], queryFn: fetchAllProducts, staleTime: 60_000 });
  const settings = useQuery({ queryKey: ["settings"], queryFn: fetchSettings, staleTime: 60_000 });
  const cart = useCart();
  const [q, setQ] = useState("");
  const dq = useDeferredValue(q);
  const [cat, setCat] = useState("TODAS");
  const [prov, setProv] = useState("TODOS");
  const [soloStock, setSoloStock] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [cartOpen, setCartOpen] = useState(false);

  const base = useMemo(() => {
    const all = (products.data ?? []).filter((p) => !p.oculto);
    return settings.data?.ocultar_sin_stock ? all.filter(isAvailable) : all;
  }, [products.data, settings.data]);

  const categorias = useMemo(() => [...new Set(base.map((p) => p.categoria))].sort(), [base]);
  const proveedores = useMemo(
    () => [...new Set(base.filter((p) => cat === "TODAS" || p.categoria === cat).map((p) => p.proveedor).filter(Boolean) as string[])].sort(),
    [base, cat],
  );

  const filtered = useMemo(() => {
    const terms = normalizeText(dq).split(/\s+/).filter(Boolean);
    return base.filter((p) => {
      if (cat !== "TODAS" && p.categoria !== cat) return false;
      if (prov !== "TODOS" && p.proveedor !== prov) return false;
      if (soloStock && !isAvailable(p)) return false;
      if (terms.length) {
        const hay = normalizeText(`${p.nombre} ${p.codigo} ${p.proveedor ?? ""}`);
        return terms.every((t) => hay.includes(t));
      }
      return true;
    });
  }, [base, dq, cat, prov, soloStock]);

  const loading = products.isLoading || settings.isLoading;
  const empty = !loading && (products.data?.length ?? 0) === 0;

  return (
    <div className="min-h-screen bg-background pb-28">
      <header className="sticky top-0 z-30 bg-header text-primary-foreground shadow-md">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 pt-3 pb-2">
          <Brand />
          <div className="ml-auto flex items-center gap-1">
            <Link to="/admin" className="rounded-md p-2 opacity-80 hover:opacity-100" aria-label="Administración">
              <Lock className="h-4 w-4" />
            </Link>
            <button onClick={() => setCartOpen(true)} className="relative rounded-lg bg-primary-foreground/15 p-2.5" aria-label={`Ver carrito, ${cart.count} unidades`}>
              <ShoppingCart className="h-5 w-5" />
              {cart.count > 0 && (
                <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1 text-[11px] font-bold text-accent-foreground">{cart.count}</span>
              )}
            </button>
          </div>
        </div>
        {!empty && (
          <div className="mx-auto max-w-6xl px-4 pb-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search" inputMode="search" value={q}
                onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }}
                placeholder="Buscar por nombre, código o proveedor…"
                className="h-11 border-0 bg-card pl-9 text-base text-foreground shadow-sm"
                aria-label="Buscar productos"
              />
            </div>
          </div>
        )}
      </header>

      {loading && <div className="mx-auto max-w-6xl px-4 py-16 text-center text-muted-foreground">Cargando catálogo…</div>}
      {products.isError && <div className="mx-auto max-w-6xl px-4 py-16 text-center text-destructive">No se pudo cargar el catálogo. Revisá tu conexión e intentá de nuevo.</div>}

      {empty && <EmptyCatalog />}

      {!loading && !empty && (
        <main className="mx-auto max-w-6xl px-4">
          <nav aria-label="Categorías" className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 py-3">
            {["TODAS", ...categorias].map((c) => (
              <button
                key={c}
                onClick={() => { setCat(c); setProv("TODOS"); setLimit(PAGE); }}
                className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${cat === c ? "border-primary bg-primary text-primary-foreground" : "bg-card text-foreground hover:bg-secondary"}`}
                aria-pressed={cat === c}
              >
                {c === "TODAS" ? "Todas" : c}
              </button>
            ))}
          </nav>
          <div className="flex flex-wrap items-center gap-2 pb-3">
            <Select value={prov} onValueChange={(v) => { setProv(v); setLimit(PAGE); }}>
              <SelectTrigger className="h-9 w-full bg-card sm:w-64" aria-label="Filtrar por proveedor"><SelectValue placeholder="Proveedor" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="TODOS">Todos los proveedores</SelectItem>
                {proveedores.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={soloStock} onChange={(e) => setSoloStock(e.target.checked)} className="h-4 w-4 accent-primary" />
              Solo con stock
            </label>
            <span className="ml-auto text-xs text-muted-foreground">
              {filtered.length.toLocaleString("es-AR")} productos · Act. {formatDate(settings.data?.ultima_actualizacion ?? null)}
            </span>
          </div>

          {filtered.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">No encontramos productos con esos filtros.</div>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {filtered.slice(0, limit).map((p) => <ProductCard key={p.id} p={p} />)}
            </ul>
          )}
          {filtered.length > limit && (
            <div className="py-6 text-center">
              <Button variant="outline" onClick={() => setLimit((l) => l + PAGE)}>Ver más productos</Button>
            </div>
          )}
        </main>
      )}

      {cart.count > 0 && !cartOpen && (
        <div className="fixed inset-x-0 bottom-0 z-30 px-4 pb-safe pt-2">
          <button onClick={() => setCartOpen(true)} className="mx-auto flex w-full max-w-md items-center justify-between rounded-xl bg-primary px-4 py-3.5 text-primary-foreground shadow-lg">
            <span className="flex items-center gap-2 font-semibold"><ShoppingCart className="h-5 w-5" /> Ver pedido ({cart.count})</span>
            <span className="font-display font-black">{formatARS(cart.total)}</span>
          </button>
        </div>
      )}

      <CartSheet open={cartOpen} onOpenChange={setCartOpen} whatsapp={settings.data?.whatsapp ?? null} />
    </div>
  );
}

function EmptyCatalog() {
  return (
    <main className="mx-auto max-w-lg px-4 py-14 text-center">
      <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-accent text-accent-foreground"><PackageOpen className="h-8 w-8" /></div>
      <h1 className="mt-5 text-2xl font-black">El catálogo todavía está vacío</h1>
      <p className="mt-2 text-muted-foreground">Estamos preparando la lista de precios. Volvé a consultar en breve.</p>
      <div className="mt-8 rounded-xl border bg-card p-5 text-left shadow-card">
        <h2 className="font-bold">Si sos administrador:</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
          <li>Ingresá al panel de administración.</li>
          <li>Subí el Excel de precios y stock con las columnas: <strong className="text-foreground">Codigo, Nombre, Familia, Proveedor principal, Precio final, Stock</strong>.</li>
          <li>Revisá el resumen y confirmá la importación.</li>
        </ol>
        <Button asChild className="mt-4 w-full"><Link to="/admin">Ir a administración</Link></Button>
      </div>
    </main>
  );
}

function ProductCard({ p }: { p: Product }) {
  const cart = useCart();
  const ok = isAvailable(p);
  const inCart = cart.items.find((i) => i.codigo === p.codigo);
  const src = photoSrc(p.foto_url);
  return (
    <li className="flex flex-col overflow-hidden rounded-xl border bg-card shadow-card">
      <div className="relative aspect-square bg-muted">
        {src ? (
          <img src={src} alt={p.nombre} loading="lazy" decoding="async" className="h-full w-full object-contain p-2" />
        ) : (
          <div className="grid h-full place-items-center text-muted-foreground/50"><ImageOff className="h-8 w-8" aria-hidden /></div>
        )}
        <span className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${ok ? "bg-success text-success-foreground" : "bg-destructive text-destructive-foreground"}`}>
          {ok ? "En stock" : "Sin stock"}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <p className="text-[11px] text-muted-foreground">Cód. {p.codigo}</p>
        <h3 className="line-clamp-3 font-sans text-sm font-semibold leading-snug">{p.nombre}</h3>
        <p className="mt-auto pt-1 font-display text-lg font-black text-primary">{formatARS(p.precio)}</p>
        {inCart ? (
          <QtyControl codigo={p.codigo} qty={inCart.qty} />
        ) : (
          <Button size="sm" className="h-9 w-full" disabled={!ok}
            onClick={() => { cart.add({ codigo: p.codigo, nombre: p.nombre, precio: p.precio }); toast.success("Agregado al pedido"); }}>
            {ok ? "Agregar" : "No disponible"}
          </Button>
        )}
      </div>
    </li>
  );
}

function QtyControl({ codigo, qty }: { codigo: string; qty: number }) {
  const cart = useCart();
  return (
    <div className="flex h-9 items-center justify-between rounded-md border bg-secondary">
      <button className="grid h-full w-9 place-items-center" onClick={() => cart.setQty(codigo, qty - 1)} aria-label="Restar uno"><Minus className="h-4 w-4" /></button>
      <input
        type="number" inputMode="numeric" min={0} value={qty}
        onChange={(e) => cart.setQty(codigo, Math.max(0, parseInt(e.target.value || "0", 10)))}
        className="w-12 bg-transparent text-center text-sm font-bold outline-none"
        aria-label="Cantidad"
      />
      <button className="grid h-full w-9 place-items-center" onClick={() => cart.setQty(codigo, qty + 1)} aria-label="Sumar uno"><Plus className="h-4 w-4" /></button>
    </div>
  );
}

function CartSheet({ open, onOpenChange, whatsapp }: { open: boolean; onOpenChange: (o: boolean) => void; whatsapp: string | null }) {
  const cart = useCart();
  const phone = whatsappDigits(whatsapp);
  function send() {
    if (!phone) { toast.error("El número de WhatsApp todavía no fue configurado por el comercio."); return; }
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(buildWhatsAppMessage(cart.items))}`;
    window.open(url, "_blank", "noopener");
  }
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col p-0 sm:max-w-md">
        <SheetHeader className="border-b p-4"><SheetTitle>Tu pedido</SheetTitle></SheetHeader>
        {cart.items.length === 0 ? (
          <div className="grid flex-1 place-items-center p-6 text-center text-muted-foreground">Todavía no agregaste productos.</div>
        ) : (
          <ul className="flex-1 divide-y overflow-y-auto">
            {cart.items.map((it) => (
              <li key={it.codigo} className="flex gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold leading-snug">{it.nombre}</p>
                  <p className="text-xs text-muted-foreground">Cód. {it.codigo} · {formatARS(it.precio)} c/u</p>
                  <div className="mt-2 w-36"><QtyControl codigo={it.codigo} qty={it.qty} /></div>
                </div>
                <div className="flex flex-col items-end justify-between">
                  <button onClick={() => cart.remove(it.codigo)} className="rounded p-1 text-muted-foreground hover:text-destructive" aria-label={`Quitar ${it.nombre}`}><Trash2 className="h-4 w-4" /></button>
                  <p className="font-bold">{formatARS(it.precio * it.qty)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="space-y-3 border-t bg-card p-4 pb-safe">
          <div className="flex justify-between text-sm"><span>Subtotal ({cart.count} u.)</span><span>{formatARS(cart.total)}</span></div>
          <div className="flex justify-between text-lg font-black"><span>Total estimado</span><span className="text-primary">{formatARS(cart.total)}</span></div>
          <p className="text-xs text-muted-foreground">Precios sujetos a confirmación por el comercio.</p>
          <Button variant="whatsapp" className="h-12 w-full text-base" disabled={cart.items.length === 0} onClick={send}>
            Enviar pedido por WhatsApp
          </Button>
          {cart.items.length > 0 && (
            <button onClick={() => cart.clear()} className="flex w-full items-center justify-center gap-1 text-xs text-muted-foreground"><X className="h-3 w-3" /> Vaciar pedido</button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
