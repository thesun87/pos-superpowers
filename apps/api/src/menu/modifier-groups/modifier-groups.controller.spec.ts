import { Test } from "@nestjs/testing";
import { ModifierGroupsController } from "./modifier-groups.controller";
import { ModifierGroupsService } from "./modifier-groups.service";

describe("ModifierGroupsController", () => {
  let controller: ModifierGroupsController;
  let service: { findAll: jest.Mock; create: jest.Mock; update: jest.Mock; remove: jest.Mock };

  beforeEach(async () => {
    service = {
      findAll: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      remove: jest.fn()
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [ModifierGroupsController],
      providers: [{ provide: ModifierGroupsService, useValue: service }]
    }).compile();
    controller = moduleRef.get(ModifierGroupsController);
  });

  it("GET / wraps findAll in { data }", async () => {
    service.findAll.mockResolvedValue([{ id: "g1", options: [] }]);
    const res = await controller.list();
    expect(res).toEqual({ data: [{ id: "g1", options: [] }] });
  });

  it("POST / parses body and creates", async () => {
    service.create.mockResolvedValue({ id: "g2" });
    await controller.create({
      name: "Size",
      selectionType: "SINGLE",
      minSelect: 1,
      maxSelect: 1,
      isRequired: true,
      options: [{ name: "S", priceDelta: 0, isDefault: true, sortOrder: 0 }]
    });
    expect(service.create).toHaveBeenCalled();
  });

  it("POST / rejects when maxSelect < minSelect", async () => {
    await expect(
      controller.create({
        name: "Bad",
        selectionType: "MULTIPLE",
        minSelect: 3,
        maxSelect: 1,
        isRequired: false,
        options: [{ name: "x", priceDelta: 0, isDefault: false, sortOrder: 0 }]
      } as never)
    ).rejects.toThrow();
    expect(service.create).not.toHaveBeenCalled();
  });

  it("PATCH /:id forwards", async () => {
    service.update.mockResolvedValue({ id: "g3" });
    await controller.update("g3", { name: "x" });
    expect(service.update).toHaveBeenCalledWith("g3", { name: "x" });
  });

  it("DELETE /:id forwards", async () => {
    await controller.remove("g4");
    expect(service.remove).toHaveBeenCalledWith("g4");
  });
});