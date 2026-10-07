/**
 * LA CAPTURE D'UN CONTENU QUI DISPARAÎT — le contrat client → serveur (#9617).
 *
 * Décision porteur du 2026-10-07 : une capture ou un enregistrement d'écran
 * pendant qu'un éphémère est affiché s'annonce à TOUTE la conversation ; une
 * tentative sur une vue unique (rendue noire) aussi. Le client DÉTECTE (iOS :
 * `userDidTakeScreenshotNotification`, `UIScreen.isCaptured` ; coque Android :
 * selon la version ; le navigateur ne peut rien détecter) et DÉCLARE les
 * messages visibles à cet instant. La passerelle JUGE chacun — droit de lecture,
 * nature par la loi de sortie (`utils/content-exit-law.ts`), affichage réel — et
 * écrit le message système (`utils/capture-notice.ts`).
 *
 * Deux transports, une même charge : l'événement `message:capture-detected`
 * (accusé {@link ContentCaptureAck}) et
 * `POST /conversations/:id/messages/capture` (corps sans `conversationId`, pris
 * dans l'adresse).
 *
 * La passerelle annonce UNE fois chaque (acteur, message, `kind`) sur toute la
 * vie annonçable du message (audit #9617, A1) : redéclarer, réessayer ou
 * enregistrer deux fois ne crée rien de plus. `captureId` (facultatif) n'est
 * qu'un identifiant de corrélation tiré par le client — une capture d'écran en
 * a un, un enregistrement en garde un du début à la fin — journalisé, jamais
 * clé de déduplication.
 */

import { z } from 'zod';

export const CONTENT_CAPTURE_KINDS = ['screenshot', 'recording'] as const;
export type ContentCaptureKind = (typeof CONTENT_CAPTURE_KINDS)[number];

/** Messages déclarés au plus par capture — un écran n'en montre pas davantage. */
export const CONTENT_CAPTURE_MAX_MESSAGES = 50;

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;
/** Ni `:` ni espace : l'identifiant entre dans une clé de déduplication. */
const CAPTURE_ID = /^[A-Za-z0-9_-]{8,64}$/;

const captureFields = {
  messageIds: z
    .array(z.string().regex(OBJECT_ID))
    .min(1)
    .max(CONTENT_CAPTURE_MAX_MESSAGES)
    .transform((ids) => [...new Set(ids)]),
  kind: z.enum(CONTENT_CAPTURE_KINDS),
  captureId: z.string().regex(CAPTURE_ID).optional(),
};

/** La charge du corps REST — la conversation est dans l'adresse. */
export const contentCaptureBodySchema = z.object(captureFields);

/** La charge de l'événement socket. */
export const contentCaptureReportSchema = z.object({
  conversationId: z.string().min(1).max(128),
  ...captureFields,
});

export type ContentCaptureBody = z.infer<typeof contentCaptureBodySchema>;
export type ContentCaptureReport = z.infer<typeof contentCaptureReportSchema>;
/** Ce que le client ÉMET (avant la transformation du schéma). */
export type ContentCaptureReportInput = z.input<typeof contentCaptureReportSchema>;

/**
 * La réponse : les messages pour lesquels un avis EXISTE désormais (cet appel
 * ou un réessai précédent de la même capture). Un message ordinaire, illisible,
 * jamais affiché à l'appelant ou annoncé hors délai est simplement absent — la
 * réponse ne dit jamais pourquoi.
 */
export type ContentCaptureResult = {
  readonly noticedMessageIds: readonly string[];
};

export type ContentCaptureAck =
  | { readonly success: true; readonly data: ContentCaptureResult }
  | { readonly success: false; readonly error: string; readonly code?: string };

/** Le schéma JSON du corps REST (Fastify) — même bornes que {@link contentCaptureBodySchema}. */
export const contentCaptureRequestJsonSchema = {
  type: 'object',
  required: ['messageIds', 'kind'],
  additionalProperties: false,
  properties: {
    messageIds: {
      type: 'array',
      minItems: 1,
      maxItems: CONTENT_CAPTURE_MAX_MESSAGES,
      items: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' },
      description: 'Messages visibles à l’écran au moment de la capture',
    },
    kind: { type: 'string', enum: [...CONTENT_CAPTURE_KINDS] },
    captureId: { type: 'string', pattern: '^[A-Za-z0-9_-]{8,64}$' },
  },
} as const;

export const contentCaptureResponseDataJsonSchema = {
  type: 'object',
  required: ['noticedMessageIds'],
  properties: {
    noticedMessageIds: { type: 'array', items: { type: 'string' } },
  },
} as const;
