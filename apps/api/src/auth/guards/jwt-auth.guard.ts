import { Injectable, type ExecutionContext } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import type { Observable } from "rxjs";

@Injectable()
export class JwtAuthGuard extends AuthGuard("jwt-access") {
  override canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    return super.canActivate(context);
  }
}
