import { z } from "zod";

export const MenuCategorySchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  name: z.string().min(1).max(80),
  sortOrder: z.number().int().nonnegative(),
  isActive: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});
export type MenuCategory = z.infer<typeof MenuCategorySchema>;

export const CreateMenuCategoryRequestSchema = z.object({
  name: z.string().min(1).max(80),
  sortOrder: z.number().int().nonnegative().default(0)
});
export type CreateMenuCategoryRequest = z.infer<typeof CreateMenuCategoryRequestSchema>;

export const UpdateMenuCategoryRequestSchema = CreateMenuCategoryRequestSchema.partial().extend({
  isActive: z.boolean().optional()
});
export type UpdateMenuCategoryRequest = z.infer<typeof UpdateMenuCategoryRequestSchema>;

export const MenuCategoryListResponseSchema = z.object({
  data: z.array(MenuCategorySchema)
});
export type MenuCategoryListResponse = z.infer<typeof MenuCategoryListResponseSchema>;