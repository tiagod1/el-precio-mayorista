import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useDeferredValue, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Search, ShoppingCart, Minus, Plus, Trash2, PackageOpen, X, ImageOff, Lock, Check, Truck, MessageCircle, Boxes } from "lucide-react";
import { toast } from "sonner";
import { Brand } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchAllProducts, fetchSettings, formatDate, isAvailable, normalizeText, photoSrc, type Product } from "@/lib/catalog";
import { useCart } from "@/lib/cart";
import { useReveal } from "@/lib/reveal";
import { formatARS, whatsappDigits } from "@/lib/import-rules";
import { customerCategory, isCashOnly } from "@/lib/catalog-rules";
import { customerSchema, emptyCustomer, prepareCustomerOrder, type CustomerData } from "@/lib/checkout";

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

  const categorias = useMemo(() => [...new Set(base.map(customerCategory))].sort(), [base]);
  const proveedores = useMemo(
    () => [...new Set(base.filter((p) => cat === "TODAS" || customerCategory(p) === cat).map((p) => p.proveedor).filter(Boolean) as string[])].sort(),
    [base, cat],
  );
  const stats = useMemo(() => ({
    total: base.length,
    enStock: base.filter(isAvailable).length,
    proveedores: new Set(base.map((p) => p.proveedor).filter(Boolean)).size,
  }), [base]);

  const filtered = useMemo(() => {
    const terms = normalizeText(dq).split(/\s+/).filter(Boolean);
    return base.filter((p) => {
      if (cat !== "TODAS" && customerCategory(p) !== cat) return false;
      if (cat !== "Cigarrillos" && prov !== "TODOS" && p.proveedor !== prov) return false;
      if (soloStock && !isAvailable(p)) return false;
      if (terms.length) {
        const hay = normalizeText(`${p.nombre} ${p.codigo} ${p.proveedor ?? ""}`);
        return terms.every((t) => hay.includes(t));
      }
      return true;
    }).sort((a, b) => (cat === "Cigarrillos" ? 0 : (a.proveedor ?? "~").localeCompare(b.proveedor ?? "~", "es")) || a.nombre.localeCompare(b.nombre, "es"));
  }, [base, dq, cat, prov, soloStock]);

  const loading = products.isLoading || settings.isLoading;
  const empty = !loading && (products.data?.length ?? 0) === 0;
  const searching = q.trim().length > 0;

  return (
    <div className="min-h-screen bg-background pb-28">
      <header className="sticky top-0 z-30 bg-header text-primary-foreground shadow-md">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 pt-3 pb-2.5">
          <Brand />
          <div className="ml-auto flex items-center gap-1.5">
            <Link to="/admin" className="rounded-md p-2 opacity-70 transition-opacity hover:opacity-100" aria-label="Administración">
              <Lock className="h-4 w-4" />
            </Link>
            <button
              onClick={() => setCartOpen(true)}
              className="relative rounded-xl bg-primary-foreground/15 p-2.5 transition-[background-color,transform] duration-200 hover:bg-primary-foreground/25 active:scale-95"
              aria-label={`Ver carrito, ${cart.count} unidades`}
            >
              <ShoppingCart className="h-5 w-5" />
              {cart.count > 0 && (
                <span key={cart.count} className="anim-bump absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-highlight px-1 text-[11px] font-black text-highlight-foreground shadow">
                  {cart.count}
                </span>
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
                className="h-11 rounded-xl border-0 bg-card pl-9 text-base text-foreground shadow-sm transition-shadow focus-visible:ring-2 focus-visible:ring-highlight"
                aria-label="Buscar productos"
              />
            </div>
          </div>
        )}
        <div className="h-1 bg-highlight" aria-hidden />
      </header>

      {loading && <LoadingGrid />}
      {products.isError && <div className="mx-auto max-w-6xl px-4 py-16 text-center text-destructive">No se pudo cargar el catálogo. Revisá tu conexión e intentá de nuevo.</div>}

      {empty && <EmptyCatalog />}

      {!loading && !empty && (
        <main className="mx-auto max-w-6xl px-4">
          {!searching && (
            <Hero total={stats.total} enStock={stats.enStock} proveedores={stats.proveedores} actualizado={settings.data?.ultima_actualizacion ?? null} />
          )}

          <nav aria-label="Categorías" className="no-scrollbar fade-edges -mx-4 flex gap-2 overflow-x-auto px-4 py-3">
            {["TODAS", ...categorias].map((c) => (
              <Button
                key={c}
                onClick={() => { setCat(c); setProv("TODOS"); setLimit(PAGE); }}
                className={`shrink-0 rounded-full border px-3.5 py-2 text-xs font-semibold transition-[background-color,color,border-color,transform] duration-200 active:scale-95 ${cat === c ? "border-primary bg-primary text-primary-foreground shadow-sm" : "bg-card text-foreground hover:border-primary/40 hover:bg-secondary"}`}
                aria-pressed={cat === c}
              >
                {c === "TODAS" ? "Todas" : c}
              </Button>
            ))}
          </nav>
          <div className="flex flex-wrap items-center gap-2 pb-3">
            {cat !== "Cigarrillos" && <Select value={prov} onValueChange={(v) => { setProv(v); setLimit(PAGE); }}>
              <SelectTrigger className="h-10 w-full rounded-xl bg-card sm:w-64" aria-label="Filtrar por proveedor"><SelectValue placeholder="Proveedor" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="TODOS">Todos los proveedores</SelectItem>
                {proveedores.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>}
            <label className={`flex h-10 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm font-medium transition-colors ${soloStock ? "border-success/50 bg-success/10" : "bg-card"}`}>
              <input type="checkbox" checked={soloStock} onChange={(e) => setSoloStock(e.target.checked)} className="h-4 w-4 accent-primary" />
              Solo con stock
            </label>
            <span className="w-full text-xs text-muted-foreground sm:ml-auto sm:w-auto">
              {filtered.length.toLocaleString("es-AR")} productos · Act. {formatDate(settings.data?.ultima_actualizacion ?? null)}
            </span>
          </div>

          {filtered.length === 0 ? (
            <div className="anim-fade-up py-16 text-center text-muted-foreground">No encontramos productos con esos filtros.</div>
          ) : (
            <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4">
              {filtered.slice(0, limit).map((p, i) => <ProductCard key={p.id} p={p} index={i % 4} />)}
            </ul>
          )}
          {filtered.length > limit && (
            <div className="py-6 text-center">
              <Button variant="outline" className="h-11 rounded-xl px-6" onClick={() => setLimit((l) => l + PAGE)}>Ver más productos</Button>
            </div>
          )}
        </main>
      )}

      {cart.count > 0 && !cartOpen && (
        <div className="anim-rise fixed inset-x-0 bottom-0 z-30 px-4 pb-safe pt-2">
          <button
            onClick={() => setCartOpen(true)}
            className="mx-auto flex w-full max-w-md items-center justify-between rounded-2xl bg-primary px-4 py-3.5 text-primary-foreground shadow-card-hover ring-1 ring-highlight/40 transition-transform duration-200 active:scale-[0.98]"
          >
            <span className="flex items-center gap-2 font-semibold">
              <span className="relative">
                <ShoppingCart className="h-5 w-5" />
                <span key={cart.count} className="anim-bump absolute -right-2 -top-2 grid h-4 min-w-4 place-items-center rounded-full bg-highlight px-0.5 text-[10px] font-black text-highlight-foreground">{cart.count}</span>
              </span>
              <span className="ml-1">Ver pedido</span>
            </span>
            <span key={cart.total} className="anim-pop font-display font-black">{formatARS(cart.total)}</span>
          </button>
        </div>
      )}

       <CartSheet open={cartOpen} onOpenChange={setCartOpen} whatsapp={settings.data?.whatsapp ?? null} products={products.data ?? []} />
    </div>
  );
}

function Hero({ total, enStock, proveedores, actualizado }: { total: number; enStock: number; proveedores: number; actualizado: string | null }) {
  const fecha = actualizado ? new Date(actualizado).toLocaleDateString("es-AR", { day: "numeric", month: "short" }) : "—";
  return (
    <section className="anim-fade-up relative -mx-4 mt-0 overflow-hidden bg-hero px-4 py-6 text-primary-foreground sm:mx-0 sm:mt-4 sm:rounded-2xl sm:px-8 sm:py-8">
      <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full border-[18px] border-highlight/20 sm:h-56 sm:w-56" aria-hidden />
      <div className="relative max-w-2xl">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-highlight px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-highlight-foreground">
          <Boxes className="h-3.5 w-3.5" aria-hidden /> Catálogo mayorista online
        </span>
        <h1 className="mt-3 text-2xl font-black leading-[1.1] tracking-tight sm:text-4xl">
          Precios de <span className="text-highlight">mayorista</span>,<br className="hidden sm:block" /> pedido directo por WhatsApp
        </h1>
        <p className="mt-2 max-w-lg text-sm opacity-85 sm:text-base">
          Buscá, agregá al pedido y envialo en un toque. Precios y stock actualizados.
        </p>
      </div>
      <dl className="relative mt-5 grid grid-cols-3 gap-2 sm:max-w-xl sm:gap-3">
        <Stat label="Productos" value={total.toLocaleString("es-AR")} />
        <Stat label="Con stock" value={enStock.toLocaleString("es-AR")} />
        <Stat label="Actualizado" value={fecha} />
      </dl>
      <ol className="relative mt-4 hidden gap-4 text-xs font-medium opacity-90 sm:flex">
        <li className="flex items-center gap-1.5"><Search className="h-3.5 w-3.5 text-highlight" aria-hidden /> Buscá entre {proveedores.toLocaleString("es-AR")} proveedores</li>
        <li className="flex items-center gap-1.5"><Truck className="h-3.5 w-3.5 text-highlight" aria-hidden /> Armá tu pedido</li>
        <li className="flex items-center gap-1.5"><MessageCircle className="h-3.5 w-3.5 text-highlight" aria-hidden /> Envialo por WhatsApp</li>
      </ol>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-primary-foreground/10 px-3 py-2 ring-1 ring-primary-foreground/15">
      <dt className="text-[10px] font-semibold uppercase tracking-wider opacity-75">{label}</dt>
      <dd className="font-display text-base font-black leading-tight sm:text-xl">{value}</dd>
    </div>
  );
}

function LoadingGrid() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-4" aria-busy="true" aria-label="Cargando catálogo">
      <div className="mb-4 h-36 animate-pulse rounded-2xl bg-muted" />
      <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <li key={i} className="overflow-hidden rounded-xl border bg-card">
            <div className="aspect-square animate-pulse bg-muted" />
            <div className="space-y-2 p-3">
              <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
              <div className="h-3 w-5/6 animate-pulse rounded bg-muted" />
              <div className="h-6 w-1/2 animate-pulse rounded bg-muted" />
            </div>
          </li>
        ))}
      </ul>
      <p className="sr-only">Cargando catálogo…</p>
    </div>
  );
}

function EmptyCatalog() {
  return (
    <main className="anim-fade-up mx-auto max-w-lg px-4 py-14 text-center">
      <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-highlight text-highlight-foreground"><PackageOpen className="h-8 w-8" /></div>
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

function ProductCard({ p, index }: { p: Product; index: number }) {
  const cart = useCart();
  const ref = useReveal<HTMLLIElement>();
  const ok = isAvailable(p);
  const inCart = cart.items.find((i) => i.codigo === p.codigo);
  const src = photoSrc(p.foto_url);
  const [added, setAdded] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
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
          {isCashOnly(p) && <p className="mt-1 text-xs font-bold text-primary">SOLO EFECTIVO</p>}
          <div className="mt-auto pt-1.5">
            <span className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Precio unitario</span>
            <p className="price-tag mt-0.5 inline-flex items-baseline rounded-md bg-highlight px-2 py-0.5 font-display text-lg font-black leading-tight text-highlight-foreground sm:text-xl">
              {formatARS(p.precio)}
            </p>
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

function QtyControl({ codigo, qty }: { codigo: string; qty: number }) {
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

function CartSheet({ open, onOpenChange, whatsapp, products }: { open: boolean; onOpenChange: (o: boolean) => void; whatsapp: string | null; products: Product[] }) {
  const cart = useCart();
  const phone = whatsappDigits(whatsapp);
  const [customer, setCustomer] = useState<CustomerData>({ ...emptyCustomer });
  const [attempted, setAttempted] = useState(false);
  const validation = customerSchema.safeParse(customer);
  const errors = validation.success ? {} : validation.error.flatten().fieldErrors;
  const productByCode = useMemo(() => new Map(products.map((product) => [product.codigo, product])), [products]);
  const fields = [
    { key: "customerNumber", label: "Número de cliente", autoComplete: "off", maxLength: 50 },
    { key: "fullName", label: "Nombre y apellido", autoComplete: "name", maxLength: 150 },
    { key: "phone", label: "Número de teléfono", autoComplete: "tel", maxLength: 30 },
    { key: "deliveryAddress", label: "Dirección de entrega", autoComplete: "street-address", maxLength: 300 },
  ] as const;
  function send() {
    setAttempted(true);
    if (!validation.success) {
      document.getElementById(`checkout-${validation.error.issues[0]?.path[0]}`)?.focus();
      return;
    }
    if (!/^\d{10,15}$/.test(phone)) { toast.error("El número de WhatsApp todavía no fue configurado correctamente por el comercio."); return; }
    let order;
    try {
      order = prepareCustomerOrder(customer, cart.items.map((item) => ({ ...item, proveedor: productByCode.get(item.codigo)?.proveedor ?? null })));
    } catch {
      toast.error("Revisá los datos y las cantidades del pedido.");
      return;
    }
    // Associate the four fields with the generated order, without changing the database.
    try { sessionStorage.setItem("epm-ultimo-pedido-v1", JSON.stringify(order)); } catch {}
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(order.message)}`;
    window.open(url, "_blank", "noopener");
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
        {cart.items.length === 0 ? (
          <div className="grid flex-1 place-items-center p-6 text-center text-muted-foreground">
            <div className="anim-fade-up">
              <ShoppingCart className="mx-auto h-10 w-10 opacity-30" />
              <p className="mt-3">Todavía no agregaste productos.</p>
            </div>
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <form id="customer-order" noValidate onSubmit={(event) => { event.preventDefault(); send(); }} className="grid gap-3 border-b p-4">
            <h2 className="font-bold">Datos del cliente</h2>
            {fields.map((field) => (
              <div key={field.key} className="space-y-1.5">
                <Label htmlFor={`checkout-${field.key}`}>{field.label} <span aria-hidden>*</span></Label>
                <Input id={`checkout-${field.key}`} name={field.key} required type={field.key === "phone" ? "tel" : "text"} autoComplete={field.autoComplete} maxLength={field.maxLength} value={customer[field.key]} onChange={(event) => setCustomer((previous) => ({ ...previous, [field.key]: event.target.value }))} aria-invalid={attempted && !!errors[field.key]} aria-describedby={attempted && errors[field.key] ? `checkout-error-${field.key}` : undefined} />
                {attempted && errors[field.key] && <p id={`checkout-error-${field.key}`} role="alert" className="text-xs text-destructive">{errors[field.key]?.[0]}</p>}
              </div>
            ))}
          </form>
          <ul className="divide-y">
            {cart.items.map((it, i) => (
              <li key={it.codigo} className="anim-fade-up flex gap-3 p-4" style={{ "--i": Math.min(i, 8) } as CSSProperties}>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold leading-snug">{it.nombre}</p>
                  <p className="text-xs text-muted-foreground">Cód. {it.codigo} · {formatARS(it.precio)} c/u</p>
                   {isCashOnly(productByCode.get(it.codigo) ?? {}) && <p className="mt-1 text-xs font-bold text-primary">SOLO EFECTIVO</p>}
                  <div className="mt-2 w-36"><QtyControl codigo={it.codigo} qty={it.qty} /></div>
                </div>
                <div className="flex flex-col items-end justify-between">
                  <button onClick={() => cart.remove(it.codigo)} className="rounded p-1.5 text-muted-foreground transition-colors hover:text-destructive" aria-label={`Quitar ${it.nombre}`}><Trash2 className="h-4 w-4" /></button>
                  <p key={it.qty} className="anim-pop font-bold">{formatARS(it.precio * it.qty)}</p>
                </div>
              </li>
            ))}
          </ul>
          </div>
        )}
        <div className="space-y-3 border-t bg-card p-4 pb-safe">
          <div className="flex justify-between text-sm"><span>Subtotal ({cart.count} u.)</span><span>{formatARS(cart.total)}</span></div>
          <div className="flex justify-between text-lg font-black"><span>Total estimado</span><span key={cart.total} className="anim-pop text-primary">{formatARS(cart.total)}</span></div>
          <p className="text-xs text-muted-foreground">Precios sujetos a confirmación por el comercio.</p>
          <Button type="submit" form="customer-order" variant="whatsapp" className="h-12 w-full rounded-xl text-base transition-transform active:scale-[0.98]" disabled={cart.items.length === 0}>
            <MessageCircle className="h-5 w-5" /> Enviar pedido por WhatsApp
          </Button>
          {cart.items.length > 0 && (
            <button onClick={() => cart.clear()} className="flex w-full items-center justify-center gap-1 py-1 text-xs text-muted-foreground hover:text-destructive"><X className="h-3 w-3" /> Vaciar pedido</button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
