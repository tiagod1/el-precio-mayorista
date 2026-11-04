// Reglas de importación del Excel de precios y stock (funciones puras, testeadas).

export const REQUIRED_COLUMNS = [
  "Codigo",
  "Nombre",
  "Familia",
  "Proveedor principal",
  "Precio final",
  "Stock",
] as const;

export type ImportProduct = {
  codigo: string;
  nombre: string;
  familia: string | null;
  categoria: string;
  proveedor: string | null;
  precio: number;
  stock: number;
};

export type ImportIssue = { fila: number; motivo: string };

export type ImportResult = {
  products: ImportProduct[];
  errors: ImportIssue[];
  warnings: ImportIssue[];
  excluded: number;
  totalRows: number;
};

export function normalizeKey(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeCategoria(familia: string | null | undefined): string {
  const f = (familia ?? "").toString().trim().toUpperCase().replace(/\s+/g, " ");
  if (!f) return "SIN CATEGORIA";
  if (normalizeKey(f).includes("cigarr")) return "CIGARRILLOS";
  return f;
}

export function isJumboPack(nombre: string): boolean {
  return /jumbo\s*-?\s*pack/i.test(nombre);
}

/** Acepta números o textos tipo "1.234,56", "$ 1234.5", "1,234.56". */
export function parseNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v).replace(/[$\s]/g, "").trim();
  if (!s) return null;
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComma && hasDot) {
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (hasComma) {
    s = s.replace(",", ".");
  } else if (hasDot && /^\-?\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, "");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function findMissingColumns(headers: string[]): string[] {
  const have = new Set(headers.map((h) => normalizeKey(String(h ?? ""))));
  return REQUIRED_COLUMNS.filter((c) => !have.has(normalizeKey(c)));
}

/** rows: objetos con las claves tal como vienen en la planilla. firstDataRow: número de fila de Excel del primer registro. */
export function processRows(
  rows: Record<string, unknown>[],
  excludedCategories: string[] = [],
  firstDataRow = 2,
): ImportResult {
  const excludedSet = new Set(excludedCategories.map((c) => normalizeCategoria(c)));
  const byCode = new Map<string, ImportProduct>();
  const errors: ImportIssue[] = [];
  const warnings: ImportIssue[] = [];
  let excluded = 0;

  rows.forEach((raw, i) => {
    const fila = firstDataRow + i;
    const r: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(raw)) r[normalizeKey(k)] = v;

    const codigo = String(r["codigo"] ?? "").trim();
    const nombre = String(r["nombre"] ?? "").trim();
    if (!codigo && !nombre) return; // fila vacía
    if (!codigo) return void errors.push({ fila, motivo: "Falta el código" });
    if (!nombre) return void errors.push({ fila, motivo: `Código ${codigo}: falta el nombre` });

    const precio = parseNumber(r["precio final"]);
    if (precio === null) return void errors.push({ fila, motivo: `Código ${codigo}: precio inválido` });
    if (precio < 0) return void errors.push({ fila, motivo: `Código ${codigo}: precio negativo` });

    const stockRaw = parseNumber(r["stock"]);
    if (r["stock"] !== undefined && r["stock"] !== "" && stockRaw === null) {
      warnings.push({ fila, motivo: `Código ${codigo}: stock inválido, se toma 0` });
    }
    const familia = String(r["familia"] ?? "").trim() || null;
    const categoria = normalizeCategoria(familia);

    if (isJumboPack(nombre) || excludedSet.has(categoria)) {
      excluded++;
      return;
    }
    if (byCode.has(codigo)) {
      warnings.push({ fila, motivo: `Código ${codigo} repetido: se usa la última aparición` });
    }
    byCode.set(codigo, {
      codigo,
      nombre,
      familia,
      categoria,
      proveedor: String(r["proveedor principal"] ?? "").trim() || null,
      precio: Math.round(precio * 100) / 100,
      stock: Math.max(0, stockRaw ?? 0),
    });
  });

  return { products: [...byCode.values()], errors, warnings, excluded, totalRows: rows.length };
}

export function formatARS(n: number): string {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2 }).format(n);
}

export function buildWhatsAppMessage(
  items: { codigo: string; nombre: string; precio: number; qty: number }[],
): string {
  const lines = items.map(
    (it) => `• ${it.qty} x ${it.nombre} (Cód. ${it.codigo}) — ${formatARS(it.precio)} c/u = ${formatARS(it.precio * it.qty)}`,
  );
  const total = items.reduce((s, it) => s + it.precio * it.qty, 0);
  return [
    "Hola El Precio Mayorista, quiero hacer el siguiente pedido:",
    "",
    ...lines,
    "",
    `*Total estimado: ${formatARS(total)}*`,
    "(Precios sujetos a confirmación)",
  ].join("\n");
}

export function whatsappDigits(phone: string | null | undefined): string {
  return (phone ?? "").replace(/\D/g, "");
}
