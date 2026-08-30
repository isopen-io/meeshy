/**
 * Cardinalités et contrats de la collection d'accusés — extraits de
 * `receipts.ts` pour tenir le budget de taille des fichiers de `routes/`
 * (directive 2026-08-28 ; cliquet #4284,
 * `__tests__/unit/routes/route-file-size-budget.test.ts`). Le fichier d'origine
 * porte toute la logique (débit, gardes, écriture, lecture, gestionnaires,
 * plugin) — ici ne vivent que des constantes, des types/interfaces et le
 * schéma Zod `ReceiptWriteBodySchema` : aucune logique, donc la portion la
 * moins risquée à sortir (#4349).
 *
 * `receipts.ts` ré-exporte chaque symbole d'ici : aucun de ses importeurs
 * (`conversations/messages.ts`, `conversations/messages-read-status.ts`,
 * `message-read-status.ts`) n'a besoin de changer son chemin d'import.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { UnifiedAuthRequest } from '../../middleware/auth';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { z } from 'zod';
import type { MessageReadStatusService } from '../../services/MessageReadStatusService';
import type { PrivacyPreferencesService } from '../../services/PrivacyPreferencesService';
import type { ConversationBridgeService } from '../../services/ConversationBridgeService';
import type { ConversationRoomEmitter } from '../../socketio/emitToConversationParticipants';
import { MarkReadBodySchema } from '../../validation/messages-schemas';

// ── Cardinalités — bornées des DEUX côtés (#4349 critère 3) ───────────────────
/**
 * Plafond d'ÉCRITURE, aligné sur `MarkReadBodySchema.messageIds` — la seule
 * borne qui existait avant ce lot, et qui ne couvrait que deux portes sur six.
 */
export const RECEIPTS_MAX_WRITE_MESSAGE_IDS = 200;

/**
 * Plafond de LECTURE, strictement inférieur à l'écriture : une lecture porte
 * plus par requête (tout ce qui vient d'apparaître à l'écran) qu'une écriture,
 * qui ne porte que ce qu'UN lecteur a réellement vu.
 */
export const RECEIPTS_MAX_READ_MESSAGE_IDS = 100;

/** Page nominative (`detail=people`) : défaut, plafond. */
export const RECEIPTS_PEOPLE_DEFAULT_LIMIT = 20;
export const RECEIPTS_PEOPLE_MAX_LIMIT = 100;
/** `scope=recent` : combien de messages récents la collection résout d'elle-même. */
export const RECEIPTS_RECENT_SCOPE_SIZE = 50;
/** Débit des écritures : 120/min par COMPTE (#4349 critère 6). */
export const RECEIPTS_WRITE_RATE_LIMIT_MAX = 120;

// ── Contrats ──────────────────────────────────────────────────────────────────
export type ReceiptType = 'read' | 'received' | 'delivered';

export interface ReceiptParams { conversationId: string; }
/** Le chemin historique `POST /conversations/:id/mark-read` nomme son paramètre `id`. */
export interface ReceiptAliasParams { id: string; }
export interface DeliveryReceiptAliasParams { conversationId: string; messageId: string; }
export interface MessageReadStatusAliasParams { messageId: string; }
export interface ReadStatusesAliasQuery { messageIds?: string; }

export interface ReceiptsQuery {
  messageIds?: string;
  scope?: 'recent';
  detail?: 'summary' | 'people';
  filter?: 'all' | 'read' | 'delivered' | 'unread';
  cursor?: string;
  limit?: number;
}

/**
 * Le corps de l'écriture unique : `MarkReadBodySchema` — déjà `.strict()`, déjà
 * borné à 200 ids et 200 langues — ÉTENDU d'un `type` plutôt que recopié, pour
 * que les deux formes ne divergent pas sur ce qu'un client a le droit de dire.
 */
export const ReceiptWriteBodySchema = MarkReadBodySchema.extend({
  type: z.enum(['read', 'received', 'delivered']),
});

export type ReceiptWriteBody = z.infer<typeof ReceiptWriteBodySchema>;

export interface ReceiptOutcome {
  readonly type: ReceiptType;
  /** Entrées RÉELLEMENT figées par cet appel. Jamais un décompte de non-lus. */
  readonly markedCount: number;
  /** Le badge APRÈS marquage — la grandeur que `markedCount` ne nomme pas. */
  readonly unreadCount: number;
  /**
   * Ids rapportés ayant survécu aux gardes et n'appartenant pas à l'appelant —
   * `null` quand l'appel n'en rapportait AUCUN (mode fenêtre), ce qui n'est pas
   * « zéro ». Hors contrat de fil : sert aux adaptateurs qui distinguent « rien
   * à faire » de « fait », comme `delivery-receipt` depuis toujours.
   */
  readonly targetedCount: number | null;
}

export type ReceiptFailure = { readonly ok: false; readonly status: 400 | 403 | 404; readonly reason: string };

export type ReceiptReader = {
  readonly ok: true;
  readonly conversationId: string;
  readonly membership: { id: string; role: string };
  /**
   * PARESSEUX et mémoïsé : le plancher coûte une lecture `Participant` (parfois
   * plus une de lien), et le chemin FENÊTRE — corps vide des clients déjà
   * distribués — n'a aucun id à lui confronter.
   */
  readonly historyFloor: () => Promise<Date | null>;
};

export interface ReceiptContext {
  readonly prisma: PrismaClient;
  readonly readStatusService: MessageReadStatusService;
  readonly privacyPreferencesService: PrivacyPreferencesService;
  readonly bridgeService: ConversationBridgeService;
  /** Lus à l'APPEL : les deux sont décorés APRÈS l'enregistrement des routes. */
  readonly io: () => ConversationRoomEmitter | null | undefined;
  readonly notificationService: () => FastifyInstance['notificationService'] | undefined;
}

// ── Débit — 120/min, clé `user:`, hook `preHandler` ───────────────────────────
/**
 * Le seul dimensionnement du débit des accusés, partagé par les cinq portes
 * d'écriture.
 *
 * `hook: 'preHandler'` — sans quoi la clé « par compte » est une FICTION :
 * `config.rateLimit` s'évalue par défaut à `onRequest`, AVANT `preValidation`,
 * donc avant que l'auth ne pose `authContext` ; le `keyGenerator` y reçoit
 * `undefined` et retombe sur `ip:${request.ip}`. Plusieurs comptes derrière une
 * même sortie (mobile, bureau, NAT) partagent un crédit prévu pour un seul, et
 * un compte à plusieurs adresses en obtient autant. Mesuré deux fois (#4334, #4347).
 *
 * `skipOnError: false` — `registerGlobalRateLimiter` pose `skipOnError: true`,
 * valeur GLOBALE qu'@fastify/rate-limit fusionne dans toute config qui ne la
 * redéclare pas : un Redis indisponible ouvrirait ces portes en grand.
 *
 * Aucun `isLocalIp` — une exemption fondée sur la FORME d'une adresse a déjà
 * neutralisé les limiteurs d'authentification du dépôt (#4137). Et 120, non 30 :
 * à 30, une conversation animée épuisait SEULE le quota que `mark-as-received`
 * et `mark-as-read` PARTAGENT, faisant rejeter des accusés de LECTURE.
 */
export function createReceiptWriteRateLimitConfig(): object {
  return {
    max: RECEIPTS_WRITE_RATE_LIMIT_MAX,
    timeWindow: '1 minute',
    hook: 'preHandler' as const,
    skipOnError: false,
    keyGenerator: (request: FastifyRequest) => {
      const authContext = (request as UnifiedAuthRequest).authContext;
      return `receipts:user:${authContext?.userId ?? `ip:${request.ip}`}`;
    },
    errorResponseBuilder: () => ({
      success: false,
      error: 'Too many read-receipt updates. Please slow down.',
      statusCode: 429,
    }),
  };
}
