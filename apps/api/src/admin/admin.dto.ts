import { z } from "zod";

export const CreateTenantRequestSchema = z.object({
  tenantName: z.string().min(1),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  ownerEmail: z.string().email(),
  ownerPassword: z.string().min(6),
  ownerFullName: z.string().min(1)
});

export type CreateTenantRequest = z.infer<typeof CreateTenantRequestSchema>;
