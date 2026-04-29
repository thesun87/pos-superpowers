import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(Strategy, "jwt-refresh") {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: any) => req?.cookies?.refreshToken
      ]),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || "dev-secret-change-in-prod"
    });
  }

  async validate(payload: { sub: string; tid: string; role: string }) {
    return { userId: payload.sub, tenantId: payload.tid, role: payload.role };
  }
}
