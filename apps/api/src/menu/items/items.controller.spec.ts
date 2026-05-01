import { Test } from "@nestjs/testing";
import { ItemsController } from "./items.controller";
import { ItemsService } from "./items.service";

describe("ItemsController", () => {
  let controller: ItemsController;
  let service: {
    findAll: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    softDelete: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      findAll: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn()
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [ItemsController],
      providers: [{ provide: ItemsService, useValue: service }]
    }).compile();
    controller = moduleRef.get(ItemsController);
  });

  it("GET / flattens modifierGroups -> modifierGroupIds in response", async () => {
    const raw = {
      id: "i1",
      tenantId: "t",
      categoryId: "c",
      name: "x",
      basePrice: 1000,
      imageUrl: null,
      sortOrder: 0,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      modifierGroups: [{ modifierGroupId: "g1", sortOrder: 0 }]
    };
    service.findAll.mockResolvedValue([raw]);
    const res = await controller.list();
    expect(res.data[0]?.modifierGroupIds).toEqual(["g1"]);
    expect(res.data[0]).not.toHaveProperty("modifierGroups");
  });

  it("GET / passes categoryId filter through", async () => {
    service.findAll.mockResolvedValue([]);
    await controller.list("11111111-1111-1111-1111-111111111111");
    expect(service.findAll).toHaveBeenCalledWith({
      categoryId: "11111111-1111-1111-1111-111111111111"
    });
  });

  it("POST / parses body and creates", async () => {
    const created = {
      id: "i2",
      modifierGroups: [{ modifierGroupId: "g1", sortOrder: 0 }]
    };
    service.create.mockResolvedValue(created);
    await controller.create({
      categoryId: "11111111-1111-1111-1111-111111111111",
      name: "Cafe",
      basePrice: 30000,
      sortOrder: 0,
      modifierGroupIds: ["22222222-2222-2222-2222-222222222222"]
    });
    expect(service.create).toHaveBeenCalled();
  });

  it("POST / rejects negative basePrice", async () => {
    await expect(
      controller.create({
        categoryId: "11111111-1111-1111-1111-111111111111",
        name: "x",
        basePrice: -1,
        sortOrder: 0,
        modifierGroupIds: []
      } as never)
    ).rejects.toThrow();
    expect(service.create).not.toHaveBeenCalled();
  });

  it("DELETE /:id calls softDelete", async () => {
    await controller.remove("11111111-1111-1111-1111-111111111111");
    expect(service.softDelete).toHaveBeenCalledWith("11111111-1111-1111-1111-111111111111");
  });
});
