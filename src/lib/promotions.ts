import { supabase } from "@/integrations/supabase/client";
import { isAvailable, type Product } from "@/lib/catalog";

export type PromotionTipo = "precio_fijo" | "porcentaje";

export type Promotion = {
  id: string;
  product_id: string;
  tipo: PromotionTipo;
  valor: number;
  starts_at: string | null;
  ends_at: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type PricedCartItem = {
  codigo: string;
  nombre: string;
  qty: number;
  precio: number;
  productId: string | null;
  promotionId: string | null;
  precioBase: number;
  precioOriginal: number;
  precioUnitario: number;
  ahorroUnitario: number;
  descuentoPct: number;
  disponible: boolean;
  stock: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export async function fetchPromotions(): Promise<Promotion[]> {
  const { data, error } = await supabase.from("promotions").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as Promotion[]).map((p) => ({ ...p, valor: Number(p.valor) }));
}

export function isPromoActive(p: Promotion, now = new Date()): boolean {
  if (!p.active) return false;
  const t = now.getTime();
  if (p.starts_at && new Date(p.starts_at).getTime() > t) return false;
  if (p.ends_at && new Date(p.ends_at).getTime() < t) return false;
  return true;
}

export function activePromotionFor(productId: string, promotions: Promotion[], now = new Date()) {
  return promotions.find((p) => p.product_id === productId && isPromoActive(p, now));
}

export function promoPrice(base: number, promo: { tipo: PromotionTipo; valor: number }): number {
  if (promo.tipo === "porcentaje") {
    const pct = Math.min(100, Math.max(0, promo.valor));
    return round2(base * (1 - pct / 100));
  }
  return round2(Math.min(Math.max(0, promo.valor), base));
}

export function promoDiscountPercent(base: number, price: number): number {
  if (base <= 0 || price >= base) return 0;
  return Math.round((1 - price / base) * 100);
}

export function priceCartItems(
  items: { codigo: string; nombre: string; precio: number; qty: number }[],
  products: Product[],
  promotions: Promotion[],
  now = new Date(),
): PricedCartItem[] {
  const productByCodigo = new Map(products.map((p) => [p.codigo, p]));
  return items.map((item) => {
    const product = productByCodigo.get(item.codigo);
    const base = product?.precio ?? item.precio;
    const promo = product ? activePromotionFor(product.id, promotions, now) : undefined;
    const unit = promo ? promoPrice(base, promo) : base;
    const effective = unit < base ? promo : undefined;
    return {
      ...item,
      productId: product?.id ?? null,
      promotionId: effective?.id ?? null,
      nombre: product?.nombre ?? item.nombre,
      precioBase: base,
      precioOriginal: base,
      precioUnitario: unit,
      ahorroUnitario: round2(Math.max(0, base - unit)),
      descuentoPct: promoDiscountPercent(base, unit),
      disponible: !!product && !product.oculto && isAvailable(product),
      stock: product?.stock ?? 0,
    };
  });
}
