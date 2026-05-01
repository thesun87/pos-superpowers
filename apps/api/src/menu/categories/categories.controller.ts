import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards
} from "@nestjs/common";
import {
  CreateMenuCategoryRequestSchema,
  UpdateMenuCategoryRequestSchema,
  type CreateMenuCategoryRequest,
  type UpdateMenuCategoryRequest,
  type MenuCategoryListResponse
} from "@pos/contracts";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../../auth/guards/roles.guard";
import { Roles } from "../../auth/guards/roles.decorator";
import { CategoriesService } from "./categories.service";

@Controller("menu/categories")
@UseGuards(JwtAuthGuard, RolesGuard)
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  @Roles("OWNER", "CASHIER")
  async list(): Promise<MenuCategoryListResponse> {
    const data = await this.categories.findAll();
    return { data: data as unknown as MenuCategoryListResponse["data"] };
  }

  @Post()
  @Roles("OWNER")
  async create(@Body() body: CreateMenuCategoryRequest) {
    const parsed = CreateMenuCategoryRequestSchema.parse(body);
    return this.categories.create(parsed);
  }

  @Patch(":id")
  @Roles("OWNER")
  async update(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: UpdateMenuCategoryRequest
  ) {
    const parsed = UpdateMenuCategoryRequestSchema.parse(body);
    return this.categories.update(id, parsed);
  }

  @Delete(":id")
  @Roles("OWNER")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param("id", new ParseUUIDPipe()) id: string): Promise<void> {
    await this.categories.softDelete(id);
  }
}