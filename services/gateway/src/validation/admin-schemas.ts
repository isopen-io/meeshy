import { z } from 'zod';

const mongoId = z.string().regex(/^[0-9a-fA-F]{24}$/);

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

export const AnalyticsMessageTypesQuerySchema = z.object({
  period: z.enum(['24h', '7d', '30d']).default('7d'),
});

export type AnalyticsMessageTypesQuery = z.infer<typeof AnalyticsMessageTypesQuerySchema>;

export const AnalyticsLanguageDistQuerySchema = z.object({
  limit: z.string().transform(Number).default('5'),
});

export type AnalyticsLanguageDistQuery = z.infer<typeof AnalyticsLanguageDistQuerySchema>;

export const AnalyticsKpisQuerySchema = z.object({
  period: z.enum(['7d', '30d', '90d']).default('30d'),
});

export type AnalyticsKpisQuery = z.infer<typeof AnalyticsKpisQuerySchema>;

// ---------------------------------------------------------------------------
// Anonymous Users
// ---------------------------------------------------------------------------

export const AnonymousUsersQuerySchema = z.object({
  offset: z.string().transform(Number).default('0'),
  limit: z.string().transform(Number).default('20'),
  search: z.string().optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

export type AnonymousUsersQuery = z.infer<typeof AnonymousUsersQuerySchema>;

// ---------------------------------------------------------------------------
// Broadcasts
// ---------------------------------------------------------------------------

export const BroadcastIdParamSchema = z.object({
  id: mongoId,
});

export type BroadcastIdParam = z.infer<typeof BroadcastIdParamSchema>;

export const BroadcastsListQuerySchema = z.object({
  offset: z.string().transform(Number).default('0'),
  limit: z.string().transform(Number).pipe(z.number().min(1).max(100)).default('20'),
  status: z.string().optional(),
});

export type BroadcastsListQuery = z.infer<typeof BroadcastsListQuerySchema>;

export const CreateBroadcastBodySchema = z.object({
  name: z.string(),
  subject: z.string(),
  body: z.string(),
  sourceLanguage: z.string(),
  targeting: z.record(z.unknown()).optional(),
});

export type CreateBroadcastBody = z.infer<typeof CreateBroadcastBodySchema>;

export const UpdateBroadcastBodySchema = z.object({
  name: z.string().optional(),
  subject: z.string().optional(),
  body: z.string().optional(),
  sourceLanguage: z.string().optional(),
  targeting: z.record(z.unknown()).optional(),
});

export type UpdateBroadcastBody = z.infer<typeof UpdateBroadcastBodySchema>;

// ---------------------------------------------------------------------------
// Invitations
// ---------------------------------------------------------------------------

export const InvitationsListQuerySchema = z.object({
  offset: z.string().transform(Number).default('0'),
  limit: z.string().transform(Number).pipe(z.number().max(100)).default('20'),
  status: z.string().optional(),
  communityId: mongoId.optional(),
  senderId: mongoId.optional(),
});

export type InvitationsListQuery = z.infer<typeof InvitationsListQuerySchema>;

export const InvitationIdParamSchema = z.object({
  id: mongoId,
});

export type InvitationIdParam = z.infer<typeof InvitationIdParamSchema>;

export const UpdateInvitationBodySchema = z.object({
  status: z.enum(['pending', 'accepted', 'rejected']),
});

export type UpdateInvitationBody = z.infer<typeof UpdateInvitationBodySchema>;

// ---------------------------------------------------------------------------
// Languages
// ---------------------------------------------------------------------------

export const LanguageStatsQuerySchema = z.object({
  period: z.enum(['7d', '30d', '90d']).default('30d'),
  limit: z.string().transform(Number).default('10'),
});

export type LanguageStatsQuery = z.infer<typeof LanguageStatsQuerySchema>;

export const LanguageTimelineQuerySchema = z.object({
  period: z.enum(['7d', '30d']).default('7d'),
  language: z.string().optional(),
});

export type LanguageTimelineQuery = z.infer<typeof LanguageTimelineQuerySchema>;

export const TranslationAccuracyQuerySchema = z.object({
  limit: z.string().transform(Number).default('10'),
});

export type TranslationAccuracyQuery = z.infer<typeof TranslationAccuracyQuerySchema>;

// ---------------------------------------------------------------------------
// Messages (admin)
// ---------------------------------------------------------------------------

export const AdminMessagesStatsQuerySchema = z.object({
  period: z.enum(['24h', '7d', '30d', '90d']).default('30d'),
});

export type AdminMessagesStatsQuery = z.infer<typeof AdminMessagesStatsQuerySchema>;

export const AdminMessagesEngagementQuerySchema = z.object({
  period: z.enum(['7d', '30d']).default('7d'),
});

export type AdminMessagesEngagementQuery = z.infer<typeof AdminMessagesEngagementQuerySchema>;

// ---------------------------------------------------------------------------
// System Rankings
// ---------------------------------------------------------------------------

export const RankingsQuerySchema = z.object({
  entityType: z.enum(['users', 'conversations', 'messages', 'links']).default('users'),
  criterion: z.string().optional(),
  period: z.enum(['1d', '7d', '30d', '60d', '90d', '180d', '365d', 'all']).default('30d'),
  limit: z
    .string()
    .transform(Number)
    .default('50')
    .pipe(z.number().min(1).max(100)),
});

export type RankingsQuery = z.infer<typeof RankingsQuerySchema>;
