import { Controller, Post, Body, Res, HttpStatus } from "@nestjs/common";
import { Response } from "express";
import { AuthService } from "./auth.service";
import type { LoginRequest } from "./dto/login.request";

@Controller("auth")
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post("login")
  async login(@Body() body: LoginRequest, @Res() res: Response) {
    const result = await this.auth.login(body.email, body.password, body.tenantId);
    res.cookie("refreshToken", result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });
    return res.status(HttpStatus.OK).json({
      accessToken: result.accessToken,
      user: result.user
    });
  }

  @Post("refresh")
  async refresh(@Body("refreshToken") refreshToken: string, @Res() res: Response) {
    const result = await this.auth.refresh(refreshToken);
    res.cookie("refreshToken", result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000
    });
    return res.status(HttpStatus.OK).json({
      accessToken: result.accessToken,
      user: result.user
    });
  }

  @Post("logout")
  logout(@Res() res: Response) {
    res.clearCookie("refreshToken");
    return res.status(HttpStatus.NO_CONTENT).send();
  }
}
