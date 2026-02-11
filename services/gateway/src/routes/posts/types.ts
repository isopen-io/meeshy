import { z } from 'zod';

// ============================================
// CURSOR PAGINATION HELPERS
// ============================================

export interface CursorData {
  createdAt: string;
  id: string;
}

export function encodeCursor(createdAt: Date | string, id: string): string {
  const data: CursorData = {
    createdAt: typeof createdAt === 'string' ? createdAt : createdAt.toISOString(),
    id,
  };
  return Buffer.from(JSON.stringify(data)).toString('base64url');
}

export function decodeCursor(cursor: string): CursorData | null {
  try {
    const json = Buffer.from(cursor, 'base64url').toString('utf-8');
    const data = JSON.parse(json);
    if (data.createdAt && data.id) return data;
    return null;
  } catch {
    return null;
  }
}

// ============================================
// ZOD SCHEMAS
// ============================================

export const CreatePostSchema = z.object({
  type: z.enum(['POST', 'STORY', 'STATUS']).default('POST'),
  visibility: z.enum(['PUBLIC', 'FRIENDS', 'COMMUNITY', 'PRIVATE']).default('PUBLIC'),
  content: z.string().max(5000).optional(),
  communityId: z.string().optional(),
  // Story-specific
  storyEffects: z.record(z.unknown()).optional(),
  // Status/mood-specific
  moodEmoji: z.string().max(10).optional(),
  audioUrl: z.string().url().optional(),
  audioDuration: z.number().int().positive().optional(),
  // Media IDs (already uploaded)
  mediaIds: z.array(z.string()).max(10).optional(),
});

export const UpdatePostSchema = z.object({
  content: z.string().max(5000).optional(),
  visibility: z.enum(['PUBLIC', 'FRIENDS', 'COMMUNITY', 'PRIVATE']).optional(),
  storyEffects: z.record(z.unknown()).optional(),
  moodEmoji: z.string().max(10).optional(),
});

export const CreateCommentSchema = z.object({
  content: z.string().min(1).max(2000),
  parentId: z.string().optional(),
});

export const RepostSchema = z.object({
  content: z.string().max(5000).optional(),
  isQuote: z.boolean().default(false),
});

export const FeedQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const LikeSchema = z.object({
  emoji: z.string().max(10).default('❤️'),
});

// ============================================
// RESPONSE TYPES
// ============================================

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    nextCursor: string | null;
    hasMore: boolean;
    limit: number;
  };
}

export interface SingleResponse<T> {
  success: boolean;
  data: T;
}

// ============================================
// FASTIFY TYPE AUGMENTATION
// ============================================

export interface PostParams {
  postId: string;
}

export interface CommentParams extends PostParams {
  commentId: string;
}

export interface UserParams {
  userId: string;
}

export interface CommunityParams {
  communityId: string;
}
