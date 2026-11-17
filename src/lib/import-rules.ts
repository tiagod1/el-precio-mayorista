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
  } else if (hasDot && /^-?\d{1,3}(\.\d{3})+$/.test(s)) {
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

// Reglas de importación de promociones (funciones puras, testeadas).

export const PROMO_REQUIRED_COLUMNS = ["Codigo", "Tipo", "Valor"] as const;

export type PromoImportTipo = "precio_fijo" | "porcentaje";

export type PromoImportItem = {
  codigo: string;
  tipo: PromoImportTipo;
  valor: number;
};

export type PromoImportResult = {
  promotions: PromoImportItem[];
  errors: ImportIssue[];
  warnings: ImportIssue[];
  totalRows: number;
};

export function findMissingPromoColumns(headers: string[]): string[] {
  const have = new Set(headers.map((h) => normalizeKey(String(h ?? ""))));
  const groups = [PROMO_CODIGO_ALIASES, PROMO_TIPO_ALIASES, PROMO_VALOR_ALIASES];
  return PROMO_REQUIRED_COLUMNS.filter((_, i) => !groups[i]!.some((a) => have.has(normalizeKey(a))));
}

const PROMO_CODIGO_ALIASES = ["codigo", "cod", "codigo producto", "codigo de producto"];
const PROMO_TIPO_ALIASES = ["tipo", "modalidad", "tipo de oferta", "tipo de promocion", "tipo promo", "tipo de descuento"];
const PROMO_VALOR_ALIASES = ["valor", "monto", "precio", "precio promocional", "descuento", "valor promo", "porcentaje", "dto"];

function promoCell(r: Record<string, unknown>, aliases: string[]): unknown {
  for (const alias of aliases) {
    const key = normalizeKey(alias);
    if (r[key] !== undefined && r[key] !== "") return r[key];
  }
  return undefined;
}

export function normalizePromoTipo(v: unknown): PromoImportTipo | null {
  const s = normalizeKey(String(v ?? ""));
  if (["fijo", "precio", "precio fijo", "precio promocional", "precio_fijo", "precio promocional fijo", "monto fijo"].includes(s)) return "precio_fijo";
  if (["porcentaje", "%", "pct", "descuento", "dto", "porcentaje de descuento", "dto %"].includes(s)) return "porcentaje";
  return null;
}

/** rows: objetos con las claves tal como vienen en la planilla. existingCodes: códigos ya cargados en products. */
export function processPromoRows(
  rows: Record<string, unknown>[],
  existingCodes: ReadonlySet<string>,
  firstDataRow = 2,
): PromoImportResult {
  const byCode = new Map<string, PromoImportItem>();
  const errors: ImportIssue[] = [];
  const warnings: ImportIssue[] = [];

  rows.forEach((raw, i) => {
    const fila = firstDataRow + i;
    const r: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(raw)) r[normalizeKey(k)] = v;

    const codigo = String(promoCell(r, PROMO_CODIGO_ALIASES) ?? "").trim();
    const tipoRaw = promoCell(r, PROMO_TIPO_ALIASES);
    const valorRaw = promoCell(r, PROMO_VALOR_ALIASES);
    if (!codigo && (tipoRaw === undefined || tipoRaw === "") && (valorRaw === undefined || valorRaw === "")) return;
    if (!codigo) return void errors.push({ fila, motivo: "Falta el código" });
    if (!existingCodes.has(codigo)) return void errors.push({ fila, motivo: `Código ${codigo} no existe en el catálogo` });

    const tipo = normalizePromoTipo(tipoRaw);
    if (!tipo) return void errors.push({ fila, motivo: `Código ${codigo}: tipo inválido (usá Fijo o Porcentaje)` });

    const valor = parseNumber(valorRaw);
    if (valor === null || valor < 0) return void errors.push({ fila, motivo: `Código ${codigo}: valor inválido` });
    if (tipo === "porcentaje" && (valor <= 0 || valor >= 100)) {
      return void errors.push({ fila, motivo: `Código ${codigo}: el porcentaje debe ser mayor a 0 y menor a 100` });
    }
    if (tipo === "precio_fijo" && valor === 0) {
      return void errors.push({ fila, motivo: `Código ${codigo}: el precio promocional debe ser mayor a 0` });
    }

    if (byCode.has(codigo)) {
      warnings.push({ fila, motivo: `Código ${codigo} repetido: se usa la última aparición` });
    }
    byCode.set(codigo, { codigo, tipo, valor: Math.round(valor * 100) / 100 });
  });

  return { promotions: [...byCode.values()], errors, warnings, totalRows: rows.length };
}

export function formatARS(n: number): string {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2 }).format(n);
}

export type WhatsAppItem = {
  codigo: string;
  nombre: string;
  qty: number;
  precio?: number;
  precioUnitario?: number;
  precioOriginal?: number;
  ahorroUnitario?: number;
  descuentoPct?: number;
  cashOnly?: boolean;
};

export type WhatsAppCustomer = {
  numero?: string;
  nombre?: string;
  telefono?: string;
  direccion?: string;
};

export function buildWhatsAppMessage(items: WhatsAppItem[], customer?: WhatsAppCustomer): string {
  const lines = items.flatMap((it) => {
    const unit = it.precioUnitario ?? it.precio ?? 0;
    const lineTotal = unit * it.qty;
    const cashNote = it.cashOnly ? "\n   *Solo efectivo*" : "";
    const main = `• ${it.qty} x ${it.nombre} (Cód. ${it.codigo}) — ${formatARS(unit)} c/u = ${formatARS(lineTotal)}${cashNote}`;
    const original = it.precioOriginal ?? it.precio ?? unit;
    if (original <= unit) return [main];
    const ahorro = it.ahorroUnitario ?? original - unit;
    const pct = it.descuentoPct ?? (original > 0 ? Math.round((1 - unit / original) * 100) : 0);
    return [main, `   Antes: ${formatARS(original)} c/u · Ahorro: ${formatARS(ahorro)} c/u (${pct}%)`];
  });
  const total = items.reduce((s, it) => s + (it.precioUnitario ?? it.precio ?? 0) * it.qty, 0);
  const clientLines = customer
    ? [
        customer.numero ? `*Número de cliente:* ${customer.numero}` : null,
        customer.nombre ? `*Nombre y apellido:* ${customer.nombre}` : null,
        customer.telefono ? `*Teléfono:* ${customer.telefono}` : null,
        customer.direccion ? `*Dirección de entrega:* ${customer.direccion}` : null,
      ].filter((l): l is string => !!l)
    : [];
  return [
    "Hola El Precio Mayorista, quiero hacer el siguiente pedido:",
    "",
    ...clientLines,
    ...(clientLines.length ? [""] : []),
    ...lines,
    "",
    `*Total estimado: ${formatARS(total)}*`,
    "(Precios sujetos a confirmación)",
  ].join("\n");
}

export function whatsappDigits(phone: string | null | undefined): string {
  return (phone ?? "").replace(/\D/g, "");
}
