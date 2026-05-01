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
  Query,
  UseGuards
} from "@nestjs/common";
import {
  CreateMenuItemRequestSchema,
  UpdateMenuItemRequestSchema,
  type CreateMenuItemRequest,
  type UpdateMenuItemRequest,
  type MenuItem,
  type MenuItemListResponse
} from "@pos/contracts";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../../auth/guards/roles.guard";
import { Roles } from "../../auth/guards/roles.decorator";
import { ItemsService } from "./items.service";

type ItemRowWithJoins = Record<string, unknown> & {
  modifierGroups: { modifierGroupId: string; sortOrder: number }[];
};

function toMenuItemDto(row: ItemRowWithJoins): MenuItem {
  const { modifierGroups, ...rest } = row;
  return {
    ...(rest as Omit<MenuItem, "modifierGroupIds">),
    modifierGroupIds: modifierGroups.map((m) => m.modifierGroupId)
  } as MenuItem;
}

@Controller("menu/items")
@UseGuards(JwtAuthGuard, RolesGuard)
export class ItemsController {
  constructor(private readonly items: ItemsService) {}

  @Get()
  @Roles("OWNER", "CASHIER")
  async list(@Query("categoryId") categoryId?: string): Promise<MenuItemListResponse> {
    const data = await this.items.findAll({ categoryId });
    return { data: (data as ItemRowWithJoins[]).map(toMenuItemDto) };
  }

  @Post()
  @Roles("OWNER")
  async create(@Body() body: CreateMenuItemRequest) {
    const parsed = CreateMenuItemRequestSchema.parse(body);
    const row = (await this.items.create(parsed)) as ItemRowWithJoins;
    return toMenuItemDto(row);
  }

  @Patch(":id")
  @Roles("OWNER")
  async update(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: UpdateMenuItemRequest
  ) {
    const parsed = UpdateMenuItemRequestSchema.parse(body);
    const row = (await this.items.update(id, parsed)) as ItemRowWithJoins;
    return toMenuItemDto(row);
  }

  @Delete(":id")
  @Roles("OWNER")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param("id", new ParseUUIDPipe()) id: string): Promise<void> {
    await this.items.softDelete(id);
  }
}
