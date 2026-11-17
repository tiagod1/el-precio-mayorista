import { describe, expect, it } from "vitest";
import { buildWhatsAppMessage, findMissingColumns, findMissingPromoColumns, formatARS, normalizeCategoria, normalizePromoTipo, parseNumber, processPromoRows, processRows } from "./import-rules";

const row = (o: Partial<Record<string, unknown>>) => ({
  Codigo: "1", Nombre: "Producto", Familia: "ALMACEN", "Proveedor principal": "P", "Precio final": 100, Stock: 5, ...o,
});

describe("reglas de importación", () => {
  it("unifica cigarrillos en CIGARRILLOS", () => {
    expect(normalizeCategoria("Cigarrillos Nobleza")).toBe("CIGARRILLOS");
    expect(normalizeCategoria("CIGARRILLO MASSALIN")).toBe("CIGARRILLOS");
  });
  it("excluye artículos Jumbo Pack", () => {
    const r = processRows([row({ Nombre: "Papas JUMBO PACK 500g" }), row({ Codigo: "2" })]);
    expect(r.excluded).toBe(1);
    expect(r.products.map((p) => p.codigo)).toEqual(["2"]);
  });
  it("excluye categorías descartadas", () => {
    const r = processRows([row({ Familia: "Bazar" })], ["BAZAR"]);
    expect(r.products).toHaveLength(0);
  });
  it.each([
    "01 - CONCEPTO NOTA DE CRÉDITO",
    "01 - CONSUMO",
    "08 - CONSUMO",
    "01 - EMPAQUE Y EMBALAJE",
  ])("excluye la familia solicitada %s sin omitir productos de almacén", (familia) => {
    const r = processRows([row({ Familia: familia }), row({ Codigo: "2", Familia: "ALMACÉN" })], [familia]);
    expect(r.excluded).toBe(1);
    expect(r.products.map((p) => p.codigo)).toEqual(["2"]);
  });
  it("detecta columnas faltantes", () => {
    expect(findMissingColumns(["Codigo", "Nombre", "Familia", "Proveedor principal", "Stock"])).toEqual(["Precio final"]);
  });
  it("rechaza precio inválido", () => {
    expect(processRows([row({ "Precio final": "abc" })]).errors).toHaveLength(1);
  });
  it("interpreta precios argentinos", () => {
    expect(parseNumber("1.234,56")).toBe(1234.56);
    expect(parseNumber("$ 2.500")).toBe(2500);
  });

  it("incluye los datos del cliente en el mensaje de WhatsApp", () => {
    const msg = buildWhatsAppMessage(
      [{ codigo: "A1", nombre: "Producto", qty: 2, precioUnitario: 100 }],
      { numero: "12345", nombre: "Juan Pérez", telefono: "5491112345678", direccion: "Calle Falsa 123" },
    );
    expect(msg).toContain("*Número de cliente:* 12345");
    expect(msg).toContain("*Nombre y apellido:* Juan Pérez");
    expect(msg).toContain("*Teléfono:* 5491112345678");
    expect(msg).toContain("*Dirección de entrega:* Calle Falsa 123");
    expect(msg).toContain("2 x Producto");
    expect(msg).toContain(`*Total estimado: ${formatARS(200)}*`);
  });
});

describe("importación de promociones", () => {
  const codes = new Set(["A1", "B2"]);
  const pro = (o: Partial<Record<string, unknown>>) => ({ Codigo: "A1", Tipo: "Porcentaje", Valor: 10, ...o });

  it("detecta columnas faltantes", () => {
    expect(findMissingPromoColumns(["Codigo", "Tipo"])).toEqual(["Valor"]);
    expect(findMissingPromoColumns(["Codigo", "Modalidad", "Valor"])).toEqual([]);
  });

  it("normaliza los dos tipos de promoción", () => {
    expect(normalizePromoTipo("fijo")).toBe("precio_fijo");
    expect(normalizePromoTipo("Precio promocional")).toBe("precio_fijo");
    expect(normalizePromoTipo("%")).toBe("porcentaje");
    expect(normalizePromoTipo("descuento")).toBe("porcentaje");
    expect(normalizePromoTipo("otra cosa")).toBeNull();
  });

  it("valida códigos, tipos y valores", () => {
    const r = processPromoRows(
      [
        pro({ Codigo: "ZZ" }),
        pro({ Tipo: "raro" }),
        pro({ Valor: "abc" }),
        pro({ Tipo: "Porcentaje", Valor: 100 }),
        pro({ Tipo: "Fijo", Valor: 0 }),
      ],
      codes,
    );
    expect(r.promotions).toHaveLength(0);
    expect(r.errors).toHaveLength(5);
  });

  it("acepta porcentaje en decimal negativo y precio final sin columna Tipo", () => {
    expect(findMissingPromoColumns(["CODIGO", "PRODUCTO", "PORCENTAJE", "PRECIO FINAL"])).toEqual([]);
    const r = processPromoRows(
      [
        { CODIGO: "A1", PRODUCTO: "X", PORCENTAJE: -0.08, "PRECIO FINAL": 92 },
        { CODIGO: "B2", PRODUCTO: "Y", PORCENTAJE: -15 },
        { CODIGO: "B2", PRODUCTO: "Y2", PORCENTAJE: -0.2, "PRECIO FINAL": 80 },
      ],
      codes,
    );
    expect(r.errors).toHaveLength(0);
    expect(r.promotions).toEqual([
      { codigo: "A1", tipo: "porcentaje", valor: 8 },
      { codigo: "B2", tipo: "porcentaje", valor: 20 },
    ]);
    expect(r.warnings).toHaveLength(1);
  });

  it("precio final solo se usa cuando no hay porcentaje ni tipo", () => {
    const r = processPromoRows([{ CODIGO: "A1", "PRECIO FINAL": 1234.5 }], codes);
    expect(r.promotions).toEqual([{ codigo: "A1", tipo: "precio_fijo", valor: 1234.5 }]);
  });

  it("acepta ambas modalidades por fila y reporta duplicados", () => {
    const r = processPromoRows(
      [pro({}), pro({ Codigo: "B2", Tipo: "Fijo", Valor: "1.500,50" }), pro({ Valor: 20 })],
      codes,
    );
    expect(r.promotions).toEqual([
      { codigo: "A1", tipo: "porcentaje", valor: 20 },
      { codigo: "B2", tipo: "precio_fijo", valor: 1500.5 },
    ]);
    expect(r.warnings).toHaveLength(1);
  });
});
