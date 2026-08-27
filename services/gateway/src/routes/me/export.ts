import { FastifyInstance } from 'fastify';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { UnifiedAuthRequest } from '../../middleware/auth';
import { sendSuccess, sendError } from '../../utils/response';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';

const logger = enhancedLogger.child({ module: 'DataExport' });

const MESSAGES_LIMIT = 10000;

type ExportType = 'profile' | 'messages' | 'contacts';
type ExportFormat = 'json' | 'csv';

function parseTypes(raw: string | undefined): ExportType[] {
  const valid: ExportType[] = ['profile', 'messages', 'contacts'];
  if (!raw) return valid;
  return raw
    .split(',')
    .map((t) => t.trim().toLowerCase() as ExportType)
    .filter((t) => valid.includes(t));
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
              description: 'Comma-separated: profile,messages,contacts',
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
      const query = request.query as { format?: string; types?: string };
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

        if (requestedTypes.includes('messages')) {
          const participantIds = await fastify.prisma.participant.findMany({
            where: { userId, type: 'user' },
            select: { id: true },
          });

          const pIds = participantIds.map((p) => p.id);

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
