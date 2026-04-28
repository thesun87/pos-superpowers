import { z } from "zod";

const PublicEnvSchema = z.object({
  NEXT_PUBLIC_API_URL: z.string().url()
});

export type PublicEnv = z.infer<typeof PublicEnvSchema>;

export function loadPublicEnv(raw: Record<string, string | undefined> = process.env): PublicEnv {
  const parsed = PublicEnvSchema.safeParse(raw);
  if (!parsed.success) {
    const missing = parsed.error.errors.map((e) => e.path.join(".")).join(", ");
    throw new Error(`Invalid public env: ${missing}`);
  }
  return parsed.data;
}
