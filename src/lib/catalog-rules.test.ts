import { describe, expect, it } from "vitest";
import { customerCategory, isCashOnly } from "./catalog-rules";

describe("navegación de cigarrillos", () => {
  it.each([
    ["NOBLEZA", "LUCKY STRIKE"],
    ["TABACOS DON JUAN", "RED POINT"],
    ["ESPERT S.A", "MILENIO"],
    ["MASSALIN PARTICULARES S.R.L", "MARLBORO"],
  ])("reúne %s sin modificar el registro", (proveedor, categoria) => {
    const product = { proveedor, categoria };
    expect(customerCategory(product)).toBe("Cigarrillos");
    expect(product).toEqual({ proveedor, categoria });
  });
  it.each([
    ["ESPERT S.A", "PAPELES"], ["ESPERT S.A", "TABACOS"],
    ["NOBLEZA", "TABACOS"], ["MASSALIN PARTICULARES S.R.L", "NICOTINA"],
    ["MASSALIN PARTICULARES S.R.L", "01 - CONCEPTO NOTA DE CRÉDITO"],
    ["OTRO PROVEEDOR", "ALMACEN"],
  ])("no incluye otros artículos de %s, %s", (proveedor, categoria) => {
    expect(customerCategory({ proveedor, categoria })).toBe(categoria);
  });
});

describe("pago exclusivo de Massalin", () => {
  it("identifica el proveedor real Massalin", () => {
    expect(isCashOnly({ proveedor: "MASSALIN PARTICULARES S.R.L" })).toBe(true);
  });
  it.each(["NOBLEZA", "TABACOS DON JUAN", "ESPERT S.A", "DISTRIBUIDOR MASSALIN", null])("no marca %s", (proveedor) => {
    expect(isCashOnly({ proveedor })).toBe(false);
  });
});