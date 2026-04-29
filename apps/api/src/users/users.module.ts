import { Module } from "@nestjs/common";
import { TenantModule } from "../tenant/tenant.module";
import { UsersService } from "./users.service";

@Module({
  imports: [TenantModule],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
