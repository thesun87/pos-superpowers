import { Test } from "@nestjs/testing";
import { CategoriesController } from "./categories.controller";
import { CategoriesService } from "./categories.service";

describe("CategoriesController", () => {
  let controller: CategoriesController;
  let service: { findAll: jest.Mock; create: jest.Mock; update: jest.Mock; softDelete: jest.Mock };

  beforeEach(async () => {
    service = {
      findAll: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn()
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [CategoriesController],
      providers: [{ provide: CategoriesService, useValue: service }]
    }).compile();
    controller = moduleRef.get(CategoriesController);
  });

  it("GET / returns { data: rows }", async () => {
    service.findAll.mockResolvedValue([{ id: "c1" }]);
    const res = await controller.list();
    expect(res).toEqual({ data: [{ id: "c1" }] });
  });

  it("POST / validates body via Zod and creates", async () => {
    service.create.mockResolvedValue({ id: "c2", name: "Cafe" });
    const res = await controller.create({ name: "Cafe", sortOrder: 0 });
    expect(service.create).toHaveBeenCalledWith({ name: "Cafe", sortOrder: 0 });
    expect(res.name).toBe("Cafe");
  });

  it("POST / rejects empty name", async () => {
    await expect(controller.create({ name: "", sortOrder: 0 } as never)).rejects.toThrow();
    expect(service.create).not.toHaveBeenCalled();
  });

  it("PATCH /:id forwards to service.update", async () => {
    service.update.mockResolvedValue({ id: "c3", name: "x" });
    await controller.update("c3", { name: "x" });
    expect(service.update).toHaveBeenCalledWith("c3", { name: "x" });
  });

  it("DELETE /:id calls softDelete", async () => {
    await controller.remove("c4");
    expect(service.softDelete).toHaveBeenCalledWith("c4");
  });
});