import { z } from "zod";

export const LoginResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  user: z.object({
    id: z.string().uuid(),
    email: z.string().email(),
    fullName: z.string(),
    role: z.enum(["OWNER", "CASHIER"]),
    tenantId: z.string().uuid()
  })
});

export type LoginResponse = z.infer<typeof LoginResponseSchema>;
