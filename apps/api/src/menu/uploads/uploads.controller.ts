import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import {
  SignUploadRequestSchema,
  type SignUploadRequest,
  type SignUploadResponse
} from "@pos/contracts";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../../auth/guards/roles.guard";
import { Roles } from "../../auth/guards/roles.decorator";
import { UploadsService } from "./uploads.service";

@Controller("menu/uploads")
@UseGuards(JwtAuthGuard, RolesGuard)
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @Post("sign")
  @Roles("OWNER")
  async sign(@Body() body: SignUploadRequest): Promise<SignUploadResponse> {
    const parsed = SignUploadRequestSchema.parse(body);
    return this.uploads.sign(parsed);
  }
}
