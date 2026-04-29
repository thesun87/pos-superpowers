import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as argon2 from "argon2";
import { PrismaService } from "../prisma/prisma.service";
import type { LoginResponse } from "./dto/login.response";

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService
  ) {}

  async login(email: string, password: string): Promise<LoginResponse> {
    const user = await this.prisma.user.findFirst({
      where: { email, isActive: true },
      include: { tenant: true }
    });
    if (!user) {
      throw new UnauthorizedException("Invalid credentials");
    }
    const valid = await argon2.verify(user.passwordHash, password);
    if (!valid) {
      throw new UnauthorizedException("Invalid credentials");
    }
    const payload = { sub: user.id, tid: user.tenantId, role: user.role };
    return {
      accessToken: this.jwt.sign(payload, { expiresIn: user.role === "OWNER" ? "15m" : "2h" }),
      refreshToken: this.jwt.sign(payload, { expiresIn: "7d" }),
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        tenantId: user.tenantId
      }
    };
  }

  async refresh(refreshToken: string): Promise<{ accessToken: string; refreshToken: string; user: LoginResponse["user"] }> {
    const payload = this.jwt.verify(refreshToken);
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { tenant: true }
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException("Invalid refresh token");
    }
    const newPayload = { sub: user.id, tid: user.tenantId, role: user.role };
    return {
      accessToken: this.jwt.sign(newPayload, { expiresIn: user.role === "OWNER" ? "15m" : "2h" }),
      refreshToken: this.jwt.sign(newPayload, { expiresIn: "7d" }),
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        tenantId: user.tenantId
      }
    };
  }
}
