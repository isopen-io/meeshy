import { FastifyInstance } from 'fastify';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { UnifiedAuthRequest } from '../../middleware/auth';
import { sendSuccess, sendError } from '../../utils/response';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import {
  resolveExportPage,
  exportPosts,
  exportStories,
  exportComments,
  exportReactions,
  exportMedia,
  exportVoiceProfile,
  exportSessions,
} from './export-sections';

const logger = enhancedLogger.child({ module: 'DataExport' });

const MESSAGES_LIMIT = 10000;

type ExportType =
  | 'profile'
  | 'messages'
  | 'contacts'
  | 'posts'
  | 'stories'
  | 'comments'
  | 'reactions'
  | 'media'
  | 'voiceProfile'
  | 'sessions';

const VALID_TYPES: ExportType[] = [
  'profile', 'messages', 'contacts', 'posts', 'stories', 'comments', 'reactions', 'media', 'voiceProfile', 'sessions',
];

type ExportFormat = 'json' | 'csv';

function parseTypes(raw: string | undefined): ExportType[] {
  if (!raw) return VALID_TYPES;
  return raw
    .split(',')
    .map((t) => t.trim() as ExportType)
    .filter((t) => VALID_TYPES.includes(t));
}

/**
 * Serialize rows to CSV.
 *
 * Cells carry text set by other users (conversation titles, other
 * participants' display names). Any cell whose first character is a
 * spreadsheet formula trigger (`=`, `+`, `-`, `@`, tab, CR) is neutralized by
 * prefixing a single quote, so opening the export in Excel / Sheets /
 * LibreOffice cannot execute a smuggled formula (CWE-1236 — CSV injection).
 * Structural quoting (comma / quote / newline) is applied on top, unchanged.
 *
 * Exported for direct behavioural testing of the neutralization.
 */
export function toCsv(headers: string[], rows: Record<string, unknown>[]): string {
  const FORMULA_TRIGGERS = /^[=+\-@\t\r]/;
  const escape = (val: unknown): string => {
    const raw = val === null || val === undefined ? '' : String(val);
    const str = FORMULA_TRIGGERS.test(raw) ? `'${raw}` : raw;
    return str.includes(',') || str.includes('"') || str.includes('\n')
      ? `"${str.replace(/"/g, '""')}"`
      : str;
  };
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h])).join(','));
  }
  return lines.join('\n');
}

// ─── Schémas de réponse des sections ajoutées par #3633 ────────────────────
//
// Des `properties` NOMMÉES, jamais `additionalProperties: true` : ce dernier
// désarme fast-json-stringify (`response-schema-closure-guard.test.ts`), et
// `me/export.ts|200` porte déjà trois entrées héritées à ce défaut — ne pas
// en ajouter sept de plus. Chaque schéma ci-dessous nomme EXACTEMENT les
// colonnes du `select` correspondant dans `export-sections.ts`.

const postExportItemSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    type: { type: 'string' },
    visibility: { type: 'string' },
    content: { type: 'string', nullable: true },
    originalLanguage: { type: 'string', nullable: true },
    communityId: { type: 'string', nullable: true },
    repostOfId: { type: 'string', nullable: true },
    isQuote: { type: 'boolean' },
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' },
  },
};

const storyExportItemSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    type: { type: 'string' },
    visibility: { type: 'string' },
    content: { type: 'string', nullable: true },
    storyEffects: { type: 'object', additionalProperties: true, nullable: true },
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' },
  },
};

const commentExportItemSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    postId: { type: 'string' },
    parentId: { type: 'string', nullable: true },
    content: { type: 'string' },
    originalLanguage: { type: 'string', nullable: true },
    isEdited: { type: 'boolean' },
    likeCount: { type: 'integer' },
    replyCount: { type: 'integer' },
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' },
  },
};

const messageReactionExportItemSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    messageId: { type: 'string' },
    emoji: { type: 'string' },
    createdAt: { type: 'string' },
  },
};

const postReactionExportItemSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    postId: { type: 'string' },
    emoji: { type: 'string' },
    createdAt: { type: 'string' },
  },
};

const commentReactionExportItemSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    commentId: { type: 'string' },
    emoji: { type: 'string' },
    createdAt: { type: 'string' },
  },
};

const attachmentExportItemSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    messageId: { type: 'string', nullable: true },
    originalName: { type: 'string' },
    mimeType: { type: 'string' },
    fileSize: { type: 'integer' },
    fileUrl: { type: 'string' },
    duration: { type: 'integer', nullable: true },
    width: { type: 'integer', nullable: true },
    height: { type: 'integer', nullable: true },
    createdAt: { type: 'string' },
  },
};

const postMediaExportItemSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    postId: { type: 'string', nullable: true },
    commentId: { type: 'string', nullable: true },
    originalName: { type: 'string' },
    mimeType: { type: 'string' },
    fileSize: { type: 'integer' },
    fileUrl: { type: 'string' },
    duration: { type: 'integer', nullable: true },
    width: { type: 'integer', nullable: true },
    height: { type: 'integer', nullable: true },
    createdAt: { type: 'string' },
  },
};

const voiceProfileExportSchema = {
  type: 'object',
  properties: {
    profileId: { type: 'string', nullable: true },
    embeddingModel: { type: 'string' },
    embeddingDimension: { type: 'integer' },
    audioCount: { type: 'integer' },
    totalDurationMs: { type: 'integer' },
    qualityScore: { type: 'number' },
    version: { type: 'integer' },
    referenceAudioUrl: { type: 'string', nullable: true },
    trainingAudioSamples: { type: 'array', items: { type: 'object', additionalProperties: true }, nullable: true },
    voiceCharacteristics: { type: 'object', additionalProperties: true, nullable: true },
    voiceAnalysisAt: { type: 'string', nullable: true },
    voicePublicAt: { type: 'string', nullable: true },
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' },
  },
};

const sessionExportItemSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    deviceType: { type: 'string', nullable: true },
    deviceVendor: { type: 'string', nullable: true },
    deviceModel: { type: 'string', nullable: true },
    osName: { type: 'string', nullable: true },
    osVersion: { type: 'string', nullable: true },
    browserName: { type: 'string', nullable: true },
    browserVersion: { type: 'string', nullable: true },
    isMobile: { type: 'boolean' },
    country: { type: 'string', nullable: true },
    city: { type: 'string', nullable: true },
    isTrusted: { type: 'boolean' },
    isCurrentSession: { type: 'boolean' },
    expiresAt: { type: 'string' },
    isValid: { type: 'boolean' },
    invalidatedAt: { type: 'string', nullable: true },
    invalidatedReason: { type: 'string', nullable: true },
    createdAt: { type: 'string' },
    lastActivityAt: { type: 'string' },
  },
};

export async function dataExportRoutes(fastify: FastifyInstance) {
  fastify.get(
    '/export',
    {
      preValidation: [fastify.authenticate],
      schema: {
        description: 'Export user data (GDPR data portability)',
        tags: ['me', 'gdpr'],
        summary: 'Export personal data',
        querystring: {
          type: 'object',
          properties: {
            format: { type: 'string', enum: ['json', 'csv'], default: 'json' },
            types: {
              type: 'string',
              description:
                'Comma-separated: profile,messages,contacts,posts,stories,comments,reactions,media,voiceProfile,sessions. ' +
                'Defaults to all ten.',
            },
            limit: {
              type: 'string',
              description:
                'Max rows per list-type section for THIS request (default 500, capped at 2000). ' +
                'Applies uniformly to posts/stories/comments/reactions/media/sessions — profile and voiceProfile are single rows and ignore it.',
            },
            offset: {
              type: 'string',
              description:
                'Rows to skip per list-type section, for the NEXT page of the same `types` list (default 0). ' +
                'Each section reports its own `<type>Count` (total matching) and `<type>HasMore` — call again with ' +
                '`offset += limit` while any requested section still has `hasMore: true`.',
            },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  exportDate: { type: 'string' },
                  format: { type: 'string' },
                  requestedTypes: { type: 'array', items: { type: 'string' } },
                  profile: {
                    type: 'object',
                    additionalProperties: true,
                    nullable: true,
                  },
                  messages: {
                    type: 'array',
                    items: { type: 'object', additionalProperties: true },
                    nullable: true,
                  },
                  messagesCount: { type: 'integer', nullable: true },
                  contacts: {
                    type: 'array',
                    items: { type: 'object', additionalProperties: true },
                    nullable: true,
                  },
                  contactsCount: { type: 'integer', nullable: true },
                  posts: { type: 'array', items: postExportItemSchema, nullable: true },
                  postsCount: { type: 'integer', nullable: true },
                  postsHasMore: { type: 'boolean', nullable: true },
                  stories: { type: 'array', items: storyExportItemSchema, nullable: true },
                  storiesCount: { type: 'integer', nullable: true },
                  storiesHasMore: { type: 'boolean', nullable: true },
                  comments: { type: 'array', items: commentExportItemSchema, nullable: true },
                  commentsCount: { type: 'integer', nullable: true },
                  commentsHasMore: { type: 'boolean', nullable: true },
                  reactions: {
                    type: 'object',
                    nullable: true,
                    properties: {
                      messages: { type: 'array', items: messageReactionExportItemSchema },
                      posts: { type: 'array', items: postReactionExportItemSchema },
                      comments: { type: 'array', items: commentReactionExportItemSchema },
                    },
                  },
                  reactionsCount: {
                    type: 'object',
                    nullable: true,
                    properties: {
                      messages: { type: 'integer' },
                      posts: { type: 'integer' },
                      comments: { type: 'integer' },
                    },
                  },
                  reactionsHasMore: {
                    type: 'object',
                    nullable: true,
                    properties: {
                      messages: { type: 'boolean' },
                      posts: { type: 'boolean' },
                      comments: { type: 'boolean' },
                    },
                  },
                  media: {
                    type: 'object',
                    nullable: true,
                    properties: {
                      attachments: { type: 'array', items: attachmentExportItemSchema },
                      postMedia: { type: 'array', items: postMediaExportItemSchema },
                    },
                  },
                  mediaCount: {
                    type: 'object',
                    nullable: true,
                    properties: {
                      attachments: { type: 'integer' },
                      postMedia: { type: 'integer' },
                    },
                  },
                  mediaHasMore: {
                    type: 'object',
                    nullable: true,
                    properties: {
                      attachments: { type: 'boolean' },
                      postMedia: { type: 'boolean' },
                    },
                  },
                  voiceProfile: { ...voiceProfileExportSchema, nullable: true },
                  sessions: { type: 'array', items: sessionExportItemSchema, nullable: true },
                  sessionsCount: { type: 'integer', nullable: true },
                  sessionsHasMore: { type: 'boolean', nullable: true },
                  csv: {
                    type: 'object',
                    additionalProperties: { type: 'string' },
                    nullable: true,
                  },
                },
              },
            },
          },
          401: errorResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const authContext = (request as unknown as UnifiedAuthRequest).authContext;

      if (!authContext?.isAuthenticated || !authContext?.registeredUser) {
        return sendError(reply, 401, 'Authentication required', {
          code: 'UNAUTHORIZED',
        });
      }

      const userId = authContext.userId;
      const query = request.query as { format?: string; types?: string; limit?: string; offset?: string };
      const format = (query.format || 'json') as ExportFormat;
      const requestedTypes = parseTypes(query.types);

      try {
        const exportData: Record<string, unknown> = {
          exportDate: new Date().toISOString(),
          format,
          requestedTypes,
        };

        if (requestedTypes.includes('profile')) {
          const user = await fastify.prisma.user.findUnique({
            where: { id: userId },
            select: {
              id: true,
              username: true,
              displayName: true,
              firstName: true,
              lastName: true,
              email: true,
              phoneNumber: true,
              bio: true,
              avatar: true,
              banner: true,
              systemLanguage: true,
              regionalLanguage: true,
              customDestinationLanguage: true,
              timezone: true,
              createdAt: true,
              lastActiveAt: true,
            },
          });

          exportData.profile = user;
        }

        // Calculée UNE fois, réutilisée par `messages` et `reactions` : une
        // seconde `participant.findMany` nue ferait passer ce fichier de 2 à 3
        // `findMany` sans `take`, au-delà de la dette gelée par
        // `unbounded-findmany-guard.test.ts`.
        let pIds: string[] = [];
        if (requestedTypes.includes('messages') || requestedTypes.includes('reactions')) {
          const participantIds = await fastify.prisma.participant.findMany({
            where: { userId, type: 'user' },
            select: { id: true },
          });
          pIds = participantIds.map((p) => p.id);
        }

        if (requestedTypes.includes('messages')) {
          const messages = await fastify.prisma.message.findMany({
            where: {
              senderId: { in: pIds },
              deletedAt: null,
            },
            select: {
              id: true,
              conversationId: true,
              content: true,
              originalLanguage: true,
              messageType: true,
              messageSource: true,
              createdAt: true,
              editedAt: true,
            },
            orderBy: { createdAt: 'desc' },
            take: MESSAGES_LIMIT,
          });

          exportData.messages = messages;
          exportData.messagesCount = messages.length;
        }

        if (requestedTypes.includes('contacts')) {
          const participations = await fastify.prisma.participant.findMany({
            where: { userId, type: 'user', isActive: true },
            select: {
              conversationId: true,
              role: true,
              joinedAt: true,
              conversation: {
                select: {
                  id: true,
                  title: true,
                  type: true,
                  createdAt: true,
                  participants: {
                    where: { isActive: true },
                    select: {
                      userId: true,
                      displayName: true,
                      avatar: true,
                      type: true,
                    },
                  },
                },
              },
            },
          });

          const contacts = participations.map((p) => ({
            conversationId: p.conversationId,
            conversationName: p.conversation.title,
            conversationType: p.conversation.type,
            role: p.role,
            joinedAt: p.joinedAt,
            participants: p.conversation.participants
              .filter((member) => member.userId !== userId)
              .map((member) => ({
                displayName: member.displayName,
                type: member.type,
              })),
          }));

          exportData.contacts = contacts;
          exportData.contactsCount = contacts.length;
        }

        const page = resolveExportPage(query);

        if (requestedTypes.includes('posts')) {
          const section = await exportPosts(fastify.prisma, userId, page);
          exportData.posts = section.items;
          exportData.postsCount = section.total;
          exportData.postsHasMore = section.hasMore;
        }

        if (requestedTypes.includes('stories')) {
          const section = await exportStories(fastify.prisma, userId, page);
          exportData.stories = section.items;
          exportData.storiesCount = section.total;
          exportData.storiesHasMore = section.hasMore;
        }

        if (requestedTypes.includes('comments')) {
          const section = await exportComments(fastify.prisma, userId, page);
          exportData.comments = section.items;
          exportData.commentsCount = section.total;
          exportData.commentsHasMore = section.hasMore;
        }

        if (requestedTypes.includes('reactions')) {
          const sections = await exportReactions(fastify.prisma, pIds, userId, page);
          exportData.reactions = {
            messages: sections.messages.items,
            posts: sections.posts.items,
            comments: sections.comments.items,
          };
          exportData.reactionsCount = {
            messages: sections.messages.total,
            posts: sections.posts.total,
            comments: sections.comments.total,
          };
          exportData.reactionsHasMore = {
            messages: sections.messages.hasMore,
            posts: sections.posts.hasMore,
            comments: sections.comments.hasMore,
          };
        }

        if (requestedTypes.includes('media')) {
          const sections = await exportMedia(fastify.prisma, userId, page);
          exportData.media = {
            attachments: sections.attachments.items,
            postMedia: sections.postMedia.items,
          };
          exportData.mediaCount = {
            attachments: sections.attachments.total,
            postMedia: sections.postMedia.total,
          };
          exportData.mediaHasMore = {
            attachments: sections.attachments.hasMore,
            postMedia: sections.postMedia.hasMore,
          };
        }

        if (requestedTypes.includes('voiceProfile')) {
          exportData.voiceProfile = await exportVoiceProfile(fastify.prisma, userId);
        }

        if (requestedTypes.includes('sessions')) {
          const section = await exportSessions(fastify.prisma, userId, page);
          exportData.sessions = section.items;
          exportData.sessionsCount = section.total;
          exportData.sessionsHasMore = section.hasMore;
        }

        if (format === 'csv') {
          const csvSections: Record<string, string> = {};

          if (exportData.profile) {
            const profile = exportData.profile as Record<string, unknown>;
            csvSections.profile = toCsv(Object.keys(profile), [profile]);
          }

          if (exportData.messages) {
            const messages = exportData.messages as Record<string, unknown>[];
            if (messages.length > 0) {
              csvSections.messages = toCsv(Object.keys(messages[0]), messages);
            }
          }

          if (exportData.contacts) {
            const contacts = exportData.contacts as Record<string, unknown>[];
            if (contacts.length > 0) {
              const flatContacts = contacts.map((c) => ({
                ...c,
                participants: JSON.stringify(c.participants),
              }));
              csvSections.contacts = toCsv(
                Object.keys(flatContacts[0]),
                flatContacts
              );
            }
          }

          if (exportData.voiceProfile) {
            const voiceProfile = exportData.voiceProfile as Record<string, unknown>;
            csvSections.voiceProfile = toCsv(Object.keys(voiceProfile), [voiceProfile]);
          }

          // Sections plates ajoutées par #3633 : même patron que `messages`
          // ci-dessus, généralisé pour éviter quatre blocs quasi identiques.
          for (const key of ['posts', 'stories', 'comments', 'sessions'] as const) {
            const rows = exportData[key] as Record<string, unknown>[] | undefined;
            if (rows && rows.length > 0) {
              csvSections[key] = toCsv(Object.keys(rows[0]), rows);
            }
          }

          // Sections à sous-tables (deux sources hétérogènes chacune) :
          // aplaties en CSV sous une clé composée `parent.enfant`.
          for (const parentKey of ['reactions', 'media'] as const) {
            const parent = exportData[parentKey] as Record<string, Record<string, unknown>[]> | undefined;
            if (!parent) continue;
            for (const [childKey, rows] of Object.entries(parent)) {
              if (rows.length > 0) {
                csvSections[`${parentKey}.${childKey}`] = toCsv(Object.keys(rows[0]), rows);
              }
            }
          }

          exportData.csv = csvSections;
        }

        logger.info(
          `[DataExport] Export completed for user=${userId} types=${requestedTypes.join(',')} format=${format}`
        );

        return sendSuccess(reply, exportData);
      } catch (error) {
        logger.error('[DataExport] Export failed:', error);
        return sendError(reply, 500, 'Export failed', {
          code: 'EXPORT_ERROR',
          message: 'An error occurred while exporting your data',
        });
      }
    }
  );
}
