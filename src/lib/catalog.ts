import { supabase } from "@/integrations/supabase/client";

export type Product = {
  id: string;
  codigo: string;
  nombre: string;
  categoria: string;
  proveedor: string | null;
  precio: number;
  stock: number;
  sin_stock_manual: boolean;
  oculto: boolean;
  foto_url: string | null;
  created_at: string;
};

export type Settings = {
  whatsapp: string | null;
  ocultar_sin_stock: boolean;
  ultima_actualizacion: string | null;
  ultimo_archivo: string | null;
  familias_excluidas: string[];
};

const COLS = "id,codigo,nombre,categoria,proveedor,precio,stock,sin_stock_manual,oculto,foto_url,created_at";

export async function fetchAllProducts(): Promise<Product[]> {
  const page = 1000;
  const out: Product[] = [];
  for (let from = 0; ; from += page) {
    const { data, error } = await supabase
      .from("products")
      .select(COLS)
      .order("nombre")
      .range(from, from + page - 1);
    if (error) throw error;
    out.push(...((data ?? []) as Product[]).map((p) => ({ ...p, precio: Number(p.precio), stock: Number(p.stock) })));
    if (!data || data.length < page) break;
  }
  return out;
}

export async function fetchSettings(): Promise<Settings> {
  const { data, error } = await supabase
    .from("settings")
    .select("whatsapp,ocultar_sin_stock,ultima_actualizacion,ultimo_archivo,familias_excluidas")
    .eq("id", 1)
    .single();
  if (error) throw error;
  return data as Settings;
}

export const isAvailable = (p: Product) => !p.sin_stock_manual && p.stock > 0;

export const photoSrc = (path: string | null) => (path ? `/api/public/foto/${path}` : null);

export function normalizeText(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

const BRAND_SKIP = new Set([
  "TABACO", "CIGARRILLO", "CIGARRILLOS", "CIGARRO", "CIGARROS", "PAPAS", "GASEOSA", "AGUA", "JUGO",
  "CERVEZA", "VINO", "ALCOHOL", "SIN", "CON", "DE", "DEL", "LA", "EL", "LOS", "LAS", "UNIDAD", "PACK",
]);

export function productBrand(p: Pick<Product, "nombre" | "proveedor">) {
  const clean = p.nombre
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9& ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const token = clean
    .split(" ")
    .find((t) => t && !BRAND_SKIP.has(t) && !/^\d/.test(t) && !/^X\d/i.test(t));
  return token || p.proveedor || "Sin marca";
}

export function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-AR", { dateStyle: "long", timeStyle: "short" });
}
