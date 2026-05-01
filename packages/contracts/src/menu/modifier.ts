import { z } from "zod";
export const SelectionTypeSchema = z.enum(["SINGLE", "MULTIPLE"]);
export type SelectionType = z. infer<typeof SelectionTypeSchema>;
export const ModifierOptionSchema = z.object({
  id: z. string().uuid(),
  modifierGroupId: z.string().uuid(),
  tenantId: z.string().uuid(),
  name: z.string().min(1).max(60),
  priceDelta: z.number().int(),
  isDefault: z.boolean(),
  sortOrder: z.number().int().nonnegative()
});
export type ModifierOption = z. infer<typeof ModifierOptionSchema>;
export const ModifierGroupSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  name: z.string().min(1).max(60),
  selectionType: SelectionTypeSchema,
  minSelect: z.number().int().nonnegative(),
  maxSelect: z.number().int().positive(),
  isRequired: z.boolean(),
  options: z.array(ModifierOptionSchema)
});
export type ModifierGroup = z. infer<typeof ModifierGroupSchema>;
export const ModifierOptionInputSchema = z.object({
  name: z.string().min(1).max(60),
  priceDelta: z.number().int().default(0),
  isDefault: z.boolean().default(false),
  sortOrder: z.number().int().nonnegative().default(0)
});
export type ModifierOptionInput = z. infer<typeof ModifierOptionInputSchema>;
export const CreateModifierGroupRequestSchema = z.object({
  name: z.string().min(1).max(60),
  selectionType: SelectionTypeSchema,
  minSelect: z.number().int().nonnegative().default(0),
  maxSelect: z.number().int().positive().default(1),
  isRequired: z.boolean().default(false),
  options: z.array(ModifierOptionInputSchema).min(1).max(20)
}). refine((g) => g.maxSelect >= g.minSelect, {
  message: "maxSelect must be >= minSelect",
  path: ["maxSelect"]
});
export type CreateModifierGroupRequest = z. infer<typeof CreateModifierGroupRequestSchema>;
export const UpdateModifierGroupRequestSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  selectionType: SelectionTypeSchema.optional(),
  minSelect: z.number().int().nonnegative().optional(),
  maxSelect: z.number().int().positive().optional(),
  isRequired: z.boolean().optional(),
  options: z.array(ModifierOptionInputSchema).min(1).max(20).optional()
});
export type UpdateModifierGroupRequest = z. infer<typeof UpdateModifierGroupRequestSchema>;
export const ModifierGroupListResponseSchema = z.object({
  data: z.array(ModifierGroupSchema)
});
export type ModifierGroupListResponse = z. infer<typeof ModifierGroupListResponseSchema>;