import { UnauthorizedException } from "@nestjs/common";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";

describe("AdminController", () => {
  let controller: AdminController;
  let mockAdminService: { createTenantWithOwner: jest.Mock };

  beforeEach(() => {
    process.env.ADMIN_KEY = "admin-key-change-in-production";
    mockAdminService = { createTenantWithOwner: jest.fn() };
    controller = new AdminController(mockAdminService as any);
  });

  describe("createTenant", () => {
    it("creates tenant and owner user", async () => {
      const result = { tenant: { id: "tid", name: "Cafe" }, user: { id: "uid", email: "owner@cafe.vn" } };
      mockAdminService.createTenantWithOwner.mockResolvedValue(result);

      const response = await controller.createTenant(
        { tenantName: "Cafe", ownerEmail: "owner@cafe.vn", ownerPassword: "secure123", ownerFullName: "Owner", slug: "cafe" },
        "admin-key-change-in-production"
      );

      expect(response).toEqual(result);
      expect(mockAdminService.createTenantWithOwner).toHaveBeenCalledWith({
        tenantName: "Cafe",
        slug: "cafe",
        ownerEmail: "owner@cafe.vn",
        ownerPassword: "secure123",
        ownerFullName: "Owner"
      });
    });

    it("rejects when ADMIN_KEY is missing", async () => {
      const originalKey = process.env.ADMIN_KEY;
      delete process.env.ADMIN_KEY;

      await expect(
        controller.createTenant(
          { tenantName: "Cafe", ownerEmail: "x@x.com", ownerPassword: "password123", ownerFullName: "X", slug: "x" },
          undefined as any
        )
      ).rejects.toThrow(UnauthorizedException);

      process.env.ADMIN_KEY = originalKey;
    });

    it("rejects when admin key does not match", async () => {
      process.env.ADMIN_KEY = "admin-key-change-in-production";

      await expect(
        controller.createTenant(
          { tenantName: "Cafe", ownerEmail: "x@x.com", ownerPassword: "password123", ownerFullName: "X", slug: "x" },
          "wrong-key"
        )
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
