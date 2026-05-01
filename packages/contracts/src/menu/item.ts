import { z } from "zod";
export const MenuItemModifierGroupRefSchema = z.object({
  modifierGroupId: z.string().uuid(),
  sortOrder: z.number().int().nonnegative()
});
export type MenuItemModifierGroupRef = z. infer<typeof MenuItemModifierGroupRefSchema>;
export const MenuItemSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  categoryId: z.string().uuid(),
  name: z.string().min(1).max(120),
  basePrice: z.number().int().nonnegative(),
  imageUrl: z.string().url().nullable(),
  sortOrder: z.number().int().nonnegative(),
  isActive: z.boolean(),
  modifierGroupIds: z.array(z.string().uuid()),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});
export type MenuItem = z. infer<typeof MenuItemSchema>;
export const CreateMenuItemRequestSchema = z.object({
  categoryId: z.string().uuid(),
  name: z.string().min(1).max(120),
  basePrice: z.number().int().nonnegative(),
  imageUrl: z.string().url().nullable().optional(),
  sortOrder: z.number().int().nonnegative().default(0),
  modifierGroupIds: z.array(z.string().uuid()).max(10).default([])
});
export type CreateMenuItemRequest = z. infer<typeof CreateMenuItemRequestSchema>;
export const UpdateMenuItemRequestSchema = z.object({
  categoryId: z.string().uuid().optional(),
  name: z.string().min(1).max(120).optional(),
  basePrice: z.number().int().nonnegative().optional(),
  imageUrl: z.string().url().nullable().optional(),
  sortOrder: z.number().int().nonnegative().optional(),
  isActive: z.boolean().optional(),
  modifierGroupIds: z.array(z.string().uuid()).max(10).optional()
});
export type UpdateMenuItemRequest = z. infer<typeof UpdateMenuItemRequestSchema>;
export const MenuItemListResponseSchema = z.object({
  data: z.array(MenuItemSchema)
});
export type MenuItemListResponse = z. infer<typeof MenuItemListResponseSchema>;