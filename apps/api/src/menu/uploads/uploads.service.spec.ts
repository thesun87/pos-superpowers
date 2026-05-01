import { Test } from "@nestjs/testing";
import { ServiceUnavailableException } from "@nestjs/common";
import { UploadsService } from "./uploads.service";
import { TenantService } from "../../tenant/tenant.service";

const presignMock = jest.fn();
jest.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: (...args: unknown[]) => presignMock(...args)
}));
jest.mock("@aws-sdk/client-s3", () => ({
  S3Client: jest.fn().mockImplementation(() => ({})),
  PutObjectCommand: jest.fn().mockImplementation((input) => ({ input }))
}));

describe("UploadsService", () => {
  let service: UploadsService;
  let tenant: { getTenantId: jest.Mock };
  const ORIG_ENV = { ...process.env };

  beforeEach(async () => {
    presignMock.mockReset();
    process.env = {
      ...ORIG_ENV,
      R2_ACCOUNT_ID: "acc",
      R2_ACCESS_KEY_ID: "key",
      R2_SECRET_ACCESS_KEY: "secret",
      R2_BUCKET: "pos-menu",
      R2_PUBLIC_URL: "https://pub-xyz.r2.dev"
    };
    tenant = { getTenantId: jest.fn().mockReturnValue("tenant-a") };
    const moduleRef = await Test.createTestingModule({
      providers: [UploadsService, { provide: TenantService, useValue: tenant }]
    }).compile();
    service = moduleRef.get(UploadsService);
  });

  afterAll(() => {
    process.env = ORIG_ENV;
  });

  it("returns a presigned URL with a tenant-scoped key", async () => {
    presignMock.mockResolvedValue("https://r2.example.com/put?sig=xyz");
    const result = await service.sign({ contentType: "image/png", contentLength: 1024 });
    expect(result.uploadUrl).toBe("https://r2.example.com/put?sig=xyz");
    expect(result.key).toMatch(/^tenants\/tenant-a\/menu\/[0-9a-f-]{36}\.png$/);
    expect(result.publicUrl).toBe(`https://pub-xyz.r2.dev/${result.key}`);
    expect(result.expiresInSeconds).toBe(300);
  });

  it("throws 503 when R2 env vars are missing", async () => {
    delete process.env.R2_ACCESS_KEY_ID;
    const moduleRef = await Test.createTestingModule({
      providers: [UploadsService, { provide: TenantService, useValue: tenant }]
    }).compile();
    const svc = moduleRef.get(UploadsService);
    await expect(
      svc.sign({ contentType: "image/png", contentLength: 1 })
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
