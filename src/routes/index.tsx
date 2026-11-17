import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useDeferredValue, useMemo, useState } from "react";
import { Search, ShoppingCart, PackageOpen, Lock, Truck, MessageCircle, Boxes, History } from "lucide-react";
import { Brand } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ProductCard } from "@/components/ProductCard";
import { CartSheet } from "@/components/CartSheet";
import { BestSellersSection, CigarettesSection, NewArrivalsSection, OffersSection, StoreNotices } from "@/components/catalog-sections";
import { RepeatOrderDialog } from "@/components/RepeatOrder";
import { fetchAllProducts, fetchSettings, formatDate, isAvailable, normalizeText, type Product } from "@/lib/catalog";
import { useCart } from "@/lib/cart";
import { formatARS } from "@/lib/import-rules";
import { activePromotionFor, fetchPromotions, priceCartItems, promoPrice, type Promotion } from "@/lib/promotions";
import { fetchBestSellers } from "@/lib/orders";

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
  const promotions = useQuery({ queryKey: ["promotions"], queryFn: fetchPromotions, staleTime: 60_000, retry: false });
  const bestSellers = useQuery({ queryKey: ["best-sellers"], queryFn: () => fetchBestSellers(12), staleTime: 60_000, retry: false });
  const cart = useCart();
  const [q, setQ] = useState("");
  const dq = useDeferredValue(q);
  const [cat, setCat] = useState("TODAS");
  const [prov, setProv] = useState("TODOS");
  const [soloStock, setSoloStock] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [cartOpen, setCartOpen] = useState(false);
  const [repeatOpen, setRepeatOpen] = useState(false);

  const base = useMemo(() => {
    const all = (products.data ?? []).filter((p) => !p.oculto);
    return settings.data?.ocultar_sin_stock ? all.filter(isAvailable) : all;
  }, [products.data, settings.data]);

  const categorias = useMemo(() => [...new Set(base.map((p) => p.categoria))].sort(), [base]);
  const proveedores = useMemo(
    () => [...new Set(base.filter((p) => cat === "TODAS" || p.categoria === cat).map((p) => p.proveedor).filter(Boolean) as string[])].sort(),
    [base, cat],
  );
  const stats = useMemo(() => ({
    total: base.length,
    enStock: base.filter(isAvailable).length,
    proveedores: new Set(base.map((p) => p.proveedor).filter(Boolean)).size,
  }), [base]);
  const promoList = useMemo(() => promotions.data ?? [], [promotions.data]);
  const promoFor = (p: Product): Promotion | undefined => {
    const promo = activePromotionFor(p.id, promoList);
    return promo && promoPrice(p.precio, promo) < p.precio ? promo : undefined;
  };
  const cartPriced = useMemo(() => priceCartItems(cart.items, base, promoList), [cart.items, base, promoList]);
  const cartTotal = cartPriced.reduce((s, i) => s + i.qty * i.precioUnitario, 0);

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
    }).sort((a, b) => (a.proveedor ?? "~").localeCompare(b.proveedor ?? "~", "es") || a.nombre.localeCompare(b.nombre, "es"));
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

          <div className="pt-3"><StoreNotices /></div>

          <nav aria-label="Categorías" className="no-scrollbar fade-edges -mx-4 flex gap-2 overflow-x-auto px-4 py-3">
            {["TODAS", ...categorias].map((c) => (
              <button
                key={c}
                onClick={() => { setCat(c); setProv("TODOS"); setLimit(PAGE); }}
                className={`shrink-0 rounded-full border px-3.5 py-2 text-xs font-semibold transition-[background-color,color,border-color,transform] duration-200 active:scale-95 ${cat === c ? "border-primary bg-primary text-primary-foreground shadow-sm" : "bg-card text-foreground hover:border-primary/40 hover:bg-secondary"}`}
                aria-pressed={cat === c}
              >
                {c === "TODAS" ? "Todas" : c}
              </button>
            ))}
          </nav>
          <div className="flex flex-wrap items-center gap-2 pb-3">
            <Button variant="outline" className="h-10 rounded-xl" onClick={() => setRepeatOpen(true)}>
              <History className="h-4 w-4" /> Repetir pedido
            </Button>
            <Select value={prov} onValueChange={(v) => { setProv(v); setLimit(PAGE); }}>
              <SelectTrigger className="h-10 w-full rounded-xl bg-card sm:w-64" aria-label="Filtrar por proveedor"><SelectValue placeholder="Proveedor" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="TODOS">Todos los proveedores</SelectItem>
                {proveedores.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
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
              {filtered.slice(0, limit).map((p, i) => <ProductCard key={p.id} p={p} index={i % 4} promo={promoFor(p)} />)}
            </ul>
          )}
          {filtered.length > limit && (
            <div className="py-6 text-center">
              <Button variant="outline" className="h-11 rounded-xl px-6" onClick={() => setLimit((l) => l + PAGE)}>Ver más productos</Button>
            </div>
          )}

          <div className="mt-8 space-y-10">
            <OffersSection products={base} promotions={promoList} />
            <CigarettesSection products={base} promotions={promoList} />
            <BestSellersSection sellers={bestSellers.data ?? []} products={base} promotions={promoList} />
            <NewArrivalsSection products={base} promotions={promoList} />
          </div>
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
            <span key={cartTotal} className="anim-pop font-display font-black">{formatARS(cartTotal)}</span>
          </button>
        </div>
      )}

      <RepeatOrderDialog open={repeatOpen} onOpenChange={setRepeatOpen} products={base} />
      <CartSheet open={cartOpen} onOpenChange={setCartOpen} whatsapp={settings.data?.whatsapp ?? null} products={base} promotions={promoList} />
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
