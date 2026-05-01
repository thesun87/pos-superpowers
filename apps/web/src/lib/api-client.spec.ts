import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { z } from "zod";
import { ApiClient, ApiError } from "./api-client";

describe("ApiClient", () => {
  const ResponseSchema = z.object({ ok: z.boolean() });
  let client: ApiClient;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    client = new ApiClient({
      baseUrl: "https://api.test",
      getToken: () => "tok-xyz",
      fetch: fetchMock as unknown as typeof fetch
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("attaches Authorization header when token is present", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );
    await client.request("/x", { method: "GET", responseSchema: ResponseSchema });
    const headers = (fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.headers as Headers;
    expect(headers.get("authorization")).toBe("Bearer tok-xyz");
  });

  it("Zod-validates the response body", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );
    const data = await client.request("/x", {
      method: "GET",
      responseSchema: ResponseSchema
    });
    expect(data).toEqual({ ok: true });
  });

  it("throws ApiError with status on non-2xx", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ message: "nope" }), { status: 403 })
    );
    await expect(
      client.request("/x", { method: "GET", responseSchema: ResponseSchema })
    ).rejects.toMatchObject({ status: 403 });
  });

  it("returns void on 204 even when responseSchema is provided", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    const data = await client.request("/x", { method: "DELETE", responseSchema: ResponseSchema });
    expect(data).toBeUndefined();
  });

  it("posts JSON body with Content-Type header", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );
    await client.request("/x", {
      method: "POST",
      body: { hello: "world" },
      responseSchema: ResponseSchema
    });
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.body).toBe(JSON.stringify({ hello: "world" }));
    expect((init.headers as Headers).get("content-type")).toBe("application/json");
  });

  it("ApiError carries server message when available", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ message: "boom" }), { status: 500 })
    );
    try {
      await client.request("/x", { method: "GET", responseSchema: ResponseSchema });
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).message).toContain("boom");
    }
  });
});
