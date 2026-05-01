import { z } from "zod";
export const SignUploadRequestSchema = z.object({
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  contentLength: z.number().int().positive().max(5 * 1024 * 1024)
});
export type SignUploadRequest = z. infer<typeof SignUploadRequestSchema>;
export const SignUploadResponseSchema = z.object({
  uploadUrl: z.string().url(),
  publicUrl: z.string().url(),
  key: z.string().min(1),
  expiresInSeconds: z.number().int().positive()
});
export type SignUploadResponse = z. infer<typeof SignUploadResponseSchema>;