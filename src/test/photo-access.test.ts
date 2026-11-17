import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ lookup: vi.fn(), download: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({ createFileRoute: () => (options: unknown) => options }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({
  from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ limit: () => ({ maybeSingle: mocks.lookup }) }) }) }) }),
}) }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {
  storage: { from: () => ({ download: mocks.download }) },
} }));
import { Route } from "@/routes/api/public/foto.$";

const get = (Route as unknown as { server: { handlers: { GET: (arg: { params: { _splat: string } }) => Promise<Response> } } }).server.handlers.GET;
describe("private product photo access", () => {
  beforeEach(() => { vi.clearAllMocks(); process.env["SUPABASE_PUBLISHABLE_KEY"] = "sb_publishable_test"; });
  it("rejects traversal without touching storage", async () => {
    expect((await get({ params: { _splat: "../private.jpg" } })).status).toBe(400);
    expect(mocks.lookup).not.toHaveBeenCalled();
    expect(mocks.download).not.toHaveBeenCalled();
  });
  it("does not download hidden or unassociated objects", async () => {
    mocks.lookup.mockResolvedValue({ data: null, error: null });
    expect((await get({ params: { _splat: "code/photo.jpg" } })).status).toBe(404);
    expect(mocks.download).not.toHaveBeenCalled();
  });
  it("fails closed when catalog authorization fails", async () => {
    mocks.lookup.mockResolvedValue({ data: null, error: { message: "unavailable" } });
    expect((await get({ params: { _splat: "code/photo.jpg" } })).status).toBe(404);
    expect(mocks.download).not.toHaveBeenCalled();
  });
  it("serves only authorized catalog objects without public caching", async () => {
    mocks.lookup.mockResolvedValue({ data: { id: "visible" }, error: null });
    mocks.download.mockResolvedValue({ data: new Blob(["photo"], { type: "image/jpeg" }), error: null });
    const response = await get({ params: { _splat: "code/photo.jpg" } });
    expect(response.status).toBe(200);
    expect(mocks.download).toHaveBeenCalledWith("code/photo.jpg");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});