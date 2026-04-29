import { Module } from "@nestjs/common";
import { HealthModule } from "./health/health.module";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./auth/auth.module";
import { TenantModule } from "./tenant/tenant.module";
import { UsersModule } from "./users/users.module";
import { AdminModule } from "./admin/admin.module";

@Module({
  imports: [
    PrismaModule,
    TenantModule,
    HealthModule,
    AuthModule,
    UsersModule,
    AdminModule,
  ],
})
export class AppModule {}
