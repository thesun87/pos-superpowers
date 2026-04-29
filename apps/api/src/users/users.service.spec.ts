import { BadRequestException } from "@nestjs/common";
import { TenantService } from "../tenant/tenant.service";
import { UsersService } from "./users.service";

describe("UsersService", () => {
  let usersService: UsersService;
  let mockPrisma: { user: { findMany: jest.Mock; findUnique: jest.Mock; findFirst: jest.Mock; create: jest.Mock; updateMany: jest.Mock } };
  let mockTenantService: { getTenantId: jest.Mock };

  beforeEach(() => {
    mockPrisma = {
      user: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn()
      }
    };
    mockTenantService = { getTenantId: jest.fn().mockReturnValue("tenant-a") };
    usersService = new UsersService(mockPrisma as any, mockTenantService as any);
  });

  describe("findAll", () => {
    it("returns users filtered by tenant ID", async () => {
      const users = [{ id: "1", email: "a@x.com" }, { id: "2", email: "b@x.com" }];
      mockPrisma.user.findMany.mockResolvedValue(users);

      const result = await usersService.findAll();

      expect(mockPrisma.user.findMany).toHaveBeenCalledWith({
        where: { tenantId: "tenant-a" }
      });
      expect(result).toEqual(users);
    });
  });

  describe("create", () => {
    it("auto-assigns tenant ID from context", async () => {
      const newUser = { id: "3", email: "c@x.com", tenantId: "tenant-a" };
      mockPrisma.user.create.mockResolvedValue(newUser);

      await usersService.create({ email: "c@x.com", passwordHash: "hash", fullName: "C", role: "CASHIER" });

      expect(mockPrisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ tenantId: "tenant-a" })
        })
      );
    });

    it("throws when no tenant context", async () => {
      mockTenantService.getTenantId.mockImplementation(() => { throw new Error("No tenant context"); });

      await expect(
        usersService.create({ email: "c@x.com", passwordHash: "hash", fullName: "C", role: "CASHIER" })
      ).rejects.toThrow("No tenant context");
    });
  });
});
