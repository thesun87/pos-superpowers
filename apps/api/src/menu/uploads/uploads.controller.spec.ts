import { Test } from "@nestjs/testing";
import { UploadsController } from "./uploads.controller";
import { UploadsService } from "./uploads.service";

describe("UploadsController", () => {
  let controller: UploadsController;
  let service: { sign: jest.Mock };

  beforeEach(async () => {
    service = { sign: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      controllers: [UploadsController],
      providers: [{ provide: UploadsService, useValue: service }]
    }).compile();
    controller = moduleRef.get(UploadsController);
  });

  it("POST /sign returns the presigned response", async () => {
    service.sign.mockResolvedValue({
      uploadUrl: "https://x",
      publicUrl: "https://y",
      key: "k",
      expiresInSeconds: 300
    });
    const res = await controller.sign({ contentType: "image/png", contentLength: 1024 });
    expect(res.uploadUrl).toBe("https://x");
  });

  it("rejects content type other than image/jpeg|png|webp", async () => {
    await expect(
      controller.sign({ contentType: "application/pdf" as never, contentLength: 100 })
    ).rejects.toThrow();
    expect(service.sign).not.toHaveBeenCalled();
  });

  it("rejects when contentLength > 5 MB", async () => {
    await expect(
      controller.sign({ contentType: "image/png", contentLength: 6 * 1024 * 1024 } as never)
    ).rejects.toThrow();
    expect(service.sign).not.toHaveBeenCalled();
  });
});
