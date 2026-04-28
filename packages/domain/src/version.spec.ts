import { describe, expect, it } from "vitest";
import { domainVersion } from "./index";

describe("domain package", () => {
  it("exposes a semver-shaped version string", () => {
    expect(domainVersion).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
