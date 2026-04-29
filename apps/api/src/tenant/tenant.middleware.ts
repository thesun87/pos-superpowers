import { Injectable, type NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import { TenantService } from "./tenant.service";

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(private readonly tenantService: TenantService) {}

  async use(req: Request & { user?: { tenantId?: string } }, _res: Response, next: NextFunction): Promise<void> {
    const publicPaths = ["/health", "/auth/login", "/auth/register", "/admin/"];
    if (publicPaths.some((path) => req.path.startsWith(path))) {
      next();
      return;
    }

    if (req.user?.tenantId) {
      await this.tenantService.set(req.user.tenantId);
    }

    next();
  }
}
