import { z } from "zod";

export const HealthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.string(),
  version: z.string(),
  uptimeSeconds: z.number().nonnegative()
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;
