import { useMemo, useState } from "react";
import { BadgePercent, Search, Truck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ProductCard } from "@/components/ProductCard";
import { productBrand, normalizeText, type Product } from "@/lib/catalog";
import { isCigaretteProduct } from "@/lib/tobacco";
import { activePromotionFor, promoDiscountPercent, promoPrice, type Promotion } from "@/lib/promotions";
import type { BestSeller } from "@/lib/orders";

export function StoreNotices() {
  return (
    <section className="grid gap-3 md:grid-cols-[1fr_1.4fr]" aria-label="Avisos del catálogo">
      <div className="flex items-start gap-3 rounded-xl border border-highlight/50 bg-highlight/15 p-4 shadow-card">
        <Truck className="mt-0.5 h-5 w-5 shrink-0 text-highlight-foreground" aria-hidden />
        <div>
          <p className="font-display text-sm font-black uppercase tracking-wide text-highlight-foreground">Los repartos se realizan los martes y jueves</p>
          <p className="mt-1 text-xs text-muted-foreground">Coordiná tu pedido con anticipación por WhatsApp.</p>
        </div>
      </div>
      <div className="rounded-xl border bg-card p-4 shadow-card">
        <div className="flex items-start gap-3">
          <BadgePercent className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
          <div className="min-w-0">
            <p className="font-display text-sm font-black uppercase tracking-wide">5% de descuento con Mercado Pago</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
              <li>Válido martes y jueves.</li>
              <li>Compra mínima de $70.000.</li>
              <li>Tope de reintegro de $8.000.</li>
              <li>Pagando únicamente con dinero en cuenta de Mercado Pago.</li>
            </ul>
            <p className="mt-2 text-[11px] font-semibold text-muted-foreground">Beneficio informativo: no se descuenta automáticamente en el carrito.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

export function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-3">
      <h2 className="font-display text-xl font-black uppercase tracking-tight sm:text-2xl">{title}</h2>
      {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
    </div>
  );
}

function promoFor(p: Product, promotions: Promotion[]) {
  const promo = activePromotionFor(p.id, promotions);
  return promo && promoPrice(p.precio, promo) < p.precio ? promo : undefined;
}

export function OffersSection({ products, promotions }: { products: Product[]; promotions: Promotion[] }) {
  const offers = useMemo(
    () => products
      .map((p) => ({ p, promo: promoFor(p, promotions) }))
      .filter((x): x is { p: Product; promo: Promotion } => !!x.promo)
      .sort((a, b) => {
        const da = promoDiscountPercent(a.p.precio, promoPrice(a.p.precio, a.promo));
        const db = promoDiscountPercent(b.p.precio, promoPrice(b.p.precio, b.promo));
        return db - da || a.p.nombre.localeCompare(b.p.nombre, "es");
      }),
    [products, promotions],
  );
  if (!offers.length) return null;
  return (
    <section aria-label="Ofertas">
      <SectionTitle title="Ofertas" subtitle="Precios promocionales vigentes." />
      <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4">
        {offers.slice(0, 12).map(({ p, promo }, i) => <ProductCard key={p.id} p={p} index={i % 4} promo={promo} />)}
      </ul>
    </section>
  );
}

export function CigarettesSection({ products, promotions }: { products: Product[]; promotions: Promotion[] }) {
  const [q, setQ] = useState("");
  const groups = useMemo(() => {
    const term = normalizeText(q);
    const list = products
      .filter(isCigaretteProduct)
      .filter((p) => !term || normalizeText(`${p.nombre} ${p.codigo}`).includes(term))
      .sort((a, b) => productBrand(a).localeCompare(productBrand(b), "es") || a.nombre.localeCompare(b.nombre, "es"));
    const map = new Map<string, Product[]>();
    for (const p of list) {
      const brand = productBrand(p);
      map.set(brand, [...(map.get(brand) ?? []), p]);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b, "es"));
  }, [products, q]);

  return (
    <section aria-label="Cigarrillos">
      <SectionTitle title="Cigarrillos" subtitle="Todos los cigarrillos del catálogo, agrupados por marca." />
      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          inputMode="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por nombre o presentación…"
          className="h-10 rounded-xl border-0 bg-card pl-9 shadow-sm"
          aria-label="Buscar cigarrillos"
        />
      </div>
      {groups.length === 0 ? (
        <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">No hay cigarrillos disponibles con esa búsqueda.</p>
      ) : (
        <div className="space-y-6">
          {groups.map(([brand, list]) => (
            <div key={brand}>
              <h3 className="mb-2 font-display text-base font-black uppercase tracking-wide text-primary">{brand}</h3>
              <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4">
                {list.map((p, i) => <ProductCard key={p.id} p={p} index={i % 4} promo={promoFor(p, promotions)} />)}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function BestSellersSection({ sellers, products, promotions }: { sellers: BestSeller[]; products: Product[]; promotions: Promotion[] }) {
  const productByCodigo = useMemo(() => new Map(products.map((p) => [p.codigo, p])), [products]);
  const list = useMemo(
    () => sellers
      .map((s) => ({ seller: s, product: productByCodigo.get(s.codigo) }))
      .filter((x): x is { seller: BestSeller; product: Product } => !!x.product && !x.product.oculto)
      .slice(0, 12),
    [sellers, productByCodigo],
  );
  return (
    <section aria-label="Más vendidos">
      <SectionTitle title="Más vendidos" subtitle="Ranking según ventas confirmadas." />
      {list.length === 0 ? (
        <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">Todavía no hay ventas confirmadas suficientes para mostrar un ranking.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4">
          {list.map(({ product: p }, i) => <ProductCard key={p.id} p={p} index={i % 4} promo={promoFor(p, promotions)} />)}
        </ul>
      )}
    </section>
  );
}

export function NewArrivalsSection({ products, promotions }: { products: Product[]; promotions: Promotion[] }) {
  const list = useMemo(
    () => [...products]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime() || a.nombre.localeCompare(b.nombre, "es"))
      .slice(0, 12),
    [products],
  );
  if (!list.length) return null;
  return (
    <section aria-label="Novedades">
      <SectionTitle title="Novedades" subtitle="Productos incorporados recientemente al catálogo." />
      <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4">
        {list.map((p, i) => <ProductCard key={p.id} p={p} index={i % 4} promo={promoFor(p, promotions)} />)}
      </ul>
    </section>
  );
}
