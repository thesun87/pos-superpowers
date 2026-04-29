import type { PrismaClient } from "@prisma/client";
import { TenantService } from "../tenant/tenant.service";

export function prismaExtension(prisma: PrismaClient, tenantService: TenantService) {
  return prisma.$extends({
    name: "tenantIsolation",
    query: {
      $allModels: {
        async $allOperations({ operation, args, query }) {
          if (process.env.FORCE_TENANT_ISOLATION !== "true") {
            return query(args);
          }

          const tenantScopedOperations = ["findMany", "findFirst", "findUnique", "update", "delete", "deleteMany", "updateMany"];
          if (!tenantScopedOperations.includes(operation)) {
            return query(args);
          }

          try {
            const tenantId = tenantService.getTenantId();
            // Only inject tenantId if the args have a where clause
            if (args && typeof args === "object" && "where" in args) {
              const nextArgs = {
                ...args,
                where: {
                  ...(args.where as Record<string, unknown>),
                  tenantId
                }
              };
              return query(nextArgs);
            }
            return query(args);
          } catch {
            return query(args);
          }
        }
      }
    }
  });
}
