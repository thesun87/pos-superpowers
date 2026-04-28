import { describe, expect, it } from "vitest";
import { loadPublicEnv } from "./env";

describe("loadPublicEnv", () => {
  it("parses a valid API URL", () => {
    const env = loadPublicEnv({ NEXT_PUBLIC_API_URL: "http://localhost:3001" });
    expect(env.NEXT_PUBLIC_API_URL).toBe("http://localhost:3001");
  });

  it("throws when API URL is missing", () => {
    expect(() => loadPublicEnv({})).toThrow(/NEXT_PUBLIC_API_URL/);
  });
});
