import { z } from 'zod';

export const EnableBodySchema = z.object({
  code: z.string().min(6).max(6),
});

export const DisableBodySchema = z.object({
  password: z.string().min(1),
  code: z.string().min(6).max(8).optional(),
});

export const VerifyBodySchema = z.object({
  code: z.string().min(6).max(9),
});

export const BackupCodesBodySchema = z.object({
  code: z.string().min(6).max(6),
});

export type EnableBody = z.infer<typeof EnableBodySchema>;
export type DisableBody = z.infer<typeof DisableBodySchema>;
export type VerifyBody = z.infer<typeof VerifyBodySchema>;
export type BackupCodesBody = z.infer<typeof BackupCodesBodySchema>;
