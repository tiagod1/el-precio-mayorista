import { describe, expect, it } from "vitest";
import { customerSchema, prepareCustomerOrder } from "./checkout";

const customer = { customerNumber: "00123", fullName: "Cliente Prueba", phone: "1144445555", deliveryAddress: "Calle de prueba 123" };
const items = [{ codigo: "1", nombre: "Artículo", precio: 100, qty: 2 }];

describe("datos obligatorios del pedido", () => {
  it.each(["customerNumber", "fullName", "phone", "deliveryAddress"] as const)("impide enviar sin %s", (field) => {
    expect(customerSchema.safeParse({ ...customer, [field]: "   " }).success).toBe(false);
    expect(() => prepareCustomerOrder({ ...customer, [field]: "" }, items)).toThrow();
  });
  it("asocia los cuatro campos distintos al pedido y mantiene cantidades y total", () => {
    const order = prepareCustomerOrder(customer, items);
    expect(order.customer).toEqual(customer);
    expect(order.items[0]?.qty).toBe(2);
    expect(order.total).toBe(200);
    for (const value of Object.values(customer)) expect(order.message).toContain(value);
  });
  it("rechaza un teléfono inválido y un carrito vacío", () => {
    expect(customerSchema.safeParse({ ...customer, phone: "abc" }).success).toBe(false);
    expect(() => prepareCustomerOrder(customer, [])).toThrow();
  });
});