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
  CreateModifierGroupRequestSchema,
  UpdateModifierGroupRequestSchema,
  type CreateModifierGroupRequest,
  type UpdateModifierGroupRequest,
  type ModifierGroupListResponse
} from "@pos/contracts";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../../auth/guards/roles.guard";
import { Roles } from "../../auth/guards/roles.decorator";
import { ModifierGroupsService } from "./modifier-groups.service";

@Controller("menu/modifier-groups")
@UseGuards(JwtAuthGuard, RolesGuard)
export class ModifierGroupsController {
  constructor(private readonly groups: ModifierGroupsService) {}

  @Get()
  @Roles("OWNER", "CASHIER")
  async list(): Promise<ModifierGroupListResponse> {
    const data = await this.groups.findAll();
    return { data: data as unknown as ModifierGroupListResponse["data"] };
  }

  @Post()
  @Roles("OWNER")
  async create(@Body() body: CreateModifierGroupRequest) {
    const parsed = CreateModifierGroupRequestSchema.parse(body);
    return this.groups.create(parsed);
  }

  @Patch(":id")
  @Roles("OWNER")
  async update(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: UpdateModifierGroupRequest
  ) {
    const parsed = UpdateModifierGroupRequestSchema.parse(body);
    return this.groups.update(id, parsed);
  }

  @Delete(":id")
  @Roles("OWNER")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param("id", new ParseUUIDPipe()) id: string): Promise<void> {
    await this.groups.remove(id);
  }
}