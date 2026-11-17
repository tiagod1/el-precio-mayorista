import { normalizeKey } from "@/lib/import-rules";

// Proveedores que comercializan cigarrillos en el catálogo actual.
const CIGARETTE_PROVIDERS = new Set([
  "nobleza",
  "tabacos don juan",
  "espert s.a",
  "massalin particulares s.r.l",
]);

// Categorías de esos proveedores que NO son cigarrillos.
const NON_CIGARETTE_CATEGORIES = new Set([
  "tabacos",
  "nicotina",
  "papeles",
  "habanos & puros",
  "98 - combos",
  "combos",
]);

export function isCigaretteProduct(p: { categoria: string; proveedor: string | null }) {
  const cat = normalizeKey(p.categoria);
  if (cat.includes("cigarr")) return true;
  if (NON_CIGARETTE_CATEGORIES.has(cat)) return false;
  return CIGARETTE_PROVIDERS.has(normalizeKey(p.proveedor ?? ""));
}

// Proveedores cuyos productos se venden solo en efectivo.
const CASH_ONLY_PROVIDERS = ["massalin", "nobleza"];

export function isCashOnlyProduct(p: { proveedor: string | null }) {
  const prov = normalizeKey(p.proveedor ?? "");
  return CASH_ONLY_PROVIDERS.some((prefix) => prov.startsWith(prefix));
}
