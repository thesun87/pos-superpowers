import { Test } from "@nestjs/testing";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";

describe("AuthController", () => {
  let controller: AuthController;
  let mockAuthService: {
    login: jest.Mock;
    refresh: jest.Mock;
  };
  let mockResponse: any;

  beforeEach(async () => {
    mockAuthService = {
      login: jest.fn(),
      refresh: jest.fn()
    };
    mockResponse = {
      cookie: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      clearCookie: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis()
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: mockAuthService }]
    }).compile();
    controller = moduleRef.get(AuthController);
  });

  describe("login", () => {
    it("returns tokens and user on valid credentials", async () => {
      const mockLoginResponse = {
        accessToken: "access-xyz",
        refreshToken: "refresh-xyz",
        user: { id: "uid", email: "owner@cafe.vn", fullName: "Owner", role: "OWNER" as const, tenantId: "tid" }
      };
      mockAuthService.login.mockResolvedValue(mockLoginResponse);

      await controller.login({ email: "owner@cafe.vn", password: "password123" }, mockResponse);

      expect(mockAuthService.login).toHaveBeenCalledWith("owner@cafe.vn", "password123");
      expect(mockResponse.cookie).toHaveBeenCalledWith("refreshToken", "refresh-xyz", expect.any(Object));
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        accessToken: "access-xyz",
        user: mockLoginResponse.user
      });
    });
  });

  describe("refresh", () => {
    it("returns new tokens from valid refresh token", async () => {
      const mockRefreshResponse = { accessToken: "new-access", refreshToken: "new-refresh", user: { id: "uid", email: "owner@cafe.vn", fullName: "Owner", role: "OWNER" as const, tenantId: "tid" } };
      mockAuthService.refresh.mockResolvedValue(mockRefreshResponse);

      await controller.refresh("refresh-xyz", mockResponse);

      expect(mockAuthService.refresh).toHaveBeenCalledWith("refresh-xyz");
      expect(mockResponse.cookie).toHaveBeenCalledWith("refreshToken", "new-refresh", expect.any(Object));
    });
  });
});
