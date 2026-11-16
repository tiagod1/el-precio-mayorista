import { normalizeKey } from "./import-rules";

type CatalogIdentity = { proveedor: string | null; categoria: string; familia?: string | null };

// Exact identities and cigarette families audited against the existing catalog.
const cigaretteFamilies: Record<string, readonly string[]> = {
  nobleza: ["camel", "lucky strike", "rothmans", "98 - combos"],
  "tabacos don juan": ["dolchester", "kiel", "master", "pier", "red point"],
  "espert s.a": ["bold", "melbourne", "milenio", "mill"],
  "massalin particulares s.r.l": ["chesterfield", "harmony", "l&m cigarritos", "marlboro", "marlboro crafted", "parliament", "philip morris", "98 - combos"],
};

export function customerCategory(product: CatalogIdentity): string {
  const family = normalizeKey(product.familia ?? product.categoria);
  const category = normalizeKey(product.categoria);
  if (category === "cigarrillos" || category === "cigarrillo") return "Cigarrillos";
  const families = cigaretteFamilies[normalizeKey(product.proveedor ?? "")];
  return families?.includes(family) ? "Cigarrillos" : product.categoria;
}

export function isCashOnly(product: { proveedor?: string | null }): boolean {
  return normalizeKey(product.proveedor ?? "") === "massalin particulares s.r.l";
}