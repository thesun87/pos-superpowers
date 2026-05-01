import { Module } from "@nestjs/common";
import { CategoriesController } from "./categories/categories.controller";
import { CategoriesService } from "./categories/categories.service";
import { ModifierGroupsController } from "./modifier-groups/modifier-groups.controller";
import { ModifierGroupsService } from "./modifier-groups/modifier-groups.service";
import { ItemsController } from "./items/items.controller";
import { ItemsService } from "./items/items.service";
import { UploadsController } from "./uploads/uploads.controller";
import { UploadsService } from "./uploads/uploads.service";
import { CategoriesRepository } from "./categories/categories.repository";
import { ModifierGroupsRepository } from "./modifier-groups/modifier-groups.repository";
import { ItemsRepository } from "./items/items.repository";

@Module({
  controllers: [
    CategoriesController,
    ModifierGroupsController,
    ItemsController,
    UploadsController
  ],
  providers: [
    CategoriesService,
    ModifierGroupsService,
    ItemsService,
    UploadsService,
    CategoriesRepository,
    ModifierGroupsRepository,
    ItemsRepository
  ]
})
export class MenuModule {}