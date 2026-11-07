/**
 * L'aperçu du dernier message des conversations récentes du tableau de bord
 * (`GET /users/me/dashboard-stats`), soumis aux MÊMES lois que la ligne de
 * liste (#16590).
 *
 * ─── POURQUOI CE MODULE EXISTE ──────────────────────────────────────────────
 *
 * La route écrivait sa propre projection d'aperçu — `{ id, content, createdAt,
 * sender }` — là où `conversationLastMessagePreviewSelect` en porte vingt-cinq,
 * et dont le doc-comment disait déjà pourquoi il avait été extrait : « Deux
 * copies auraient dérivé ». C'était la troisième, et elle avait dérivé de SIX
 * lois à la fois :
 *
 *   | loi absente | ce que son absence servait |
 *   |---|---|
 *   | retenue de l'aperçu protégé (#6111, #7545) | le TEXTE d'une VUE UNIQUE, d'un FLOUTÉ, d'un CHIFFRÉ ou d'un éphémère EXPIRÉ |
 *   | échéance de lecteur (#7451) et chaîne citée (#8630) | l'heure INTERNE de destruction lue comme une échéance, donc un expiré pris pour vivant |
 *   | plancher d'historique | le dernier message écrit AVANT l'arrivée d'un entrant par lien `allowViewHistory: false` |
 *   | masquage personnel | un `delete-for-me` ou un `clear-history`, sans repli sur le message visible précédent |
 *   | avis de capture (#9629) | un avis qui ne concerne pas ce lecteur, rendu comme un message |
 *   | ouverture au repos (#11381) | un `server`/`hybrid` en `content: ''`, sans dire qu'il est scellé |
 *
 * ─── AUCUNE LOI N'EST RÉÉCRITE ICI ──────────────────────────────────────────
 *
 * Ce module COMPOSE, dans l'ordre où `GET /conversations` les compose, les
 * unités déjà extraites de `core-list.ts` : `loadListEphemeralExpiries`,
 * `loadListInheritedExpiries`, `loadViewOnceConsumptions`,
 * `resolvePreviewProtection` et `projectListLastMessageBody`. Il n'ajoute pas
 * une septième loi — il en est le second APPELANT, et c'est tout ce qu'il
 * fallait.
 *
 * La retenue est SERVEUR, pas cliente : `projectListLastMessageBody` rend
 * `content: ''` pour un aperçu protégé et garde les drapeaux qui QUALIFIENT le
 * placeholder. C'est le contrat de la famille APERÇU, et le dashboard servait
 * jusqu'ici le texte à sa place.
 *
 * ─── FAIL-CLOSED SUR LE PLANCHER, TOLÉRANT SUR LE MASQUAGE ──────────────────
 *
 * Un plancher ILLISIBLE retire l'aperçu (c'est un contrôle d'accès : il échoue
 * en montrant moins) ; une lecture de masquage qui tombe sert l'aperçu (c'est
 * une courtoisie, et `resolveVisibleLastMessages` porte déjà cet arbitrage).
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { inheritedEphemeralExpiresAt } from '@meeshy/shared/utils/ephemeral-countdown';

import {
  CONVERSATION_LAST_MESSAGE_PREVIEW_QUERY,
  conversationLastMessagePreviewSelect,
} from '../conversations/core-selects';
import { loadListEphemeralExpiries, loadListInheritedExpiries } from '../conversations/utils/list-ephemeral-expiry';
import { resolvePreviewProtection } from '../conversations/utils/last-message-nature';
import { projectListLastMessageBody } from '../conversations/utils/list-last-message-body';
import { loadViewOnceConsumptions, viewOnceConsumptionKey } from '../../services/messaging/readViewOnceConsumption';
import { HISTORY_FLOOR_PARTICIPANT_SELECT, loadHistoryFloorsOrFail } from '../../services/historyFloor';
import { resolveVisibleLastMessages } from '../../services/resolveVisibleLastMessage';
import { revealAtRestRows } from '../../services/messaging/serverAtRest';
import { gatewayKeyring } from '../../services/messaging/atRestTranslationSource';
import { unsetOrNull } from '../../utils/prisma-unset';
import { enhancedLogger } from '../../utils/logger-enhanced';

const logger = enhancedLogger.child({ module: 'dashboardRecentPreview' });

export { CONVERSATION_LAST_MESSAGE_PREVIEW_QUERY };

/** Une conversation de la page, telle que la route l'a lue. */
export interface DashboardConversationRow {
  readonly id: string;
  readonly messages: ReadonlyArray<Record<string, unknown>>;
}

/** L'aperçu SERVI, ou `null` quand aucune ligne ne l'est pour ce lecteur. */
export type DashboardPreview = Record<string, unknown> | null;

type PreviewRow = Record<string, unknown> & { readonly id: string; readonly createdAt: Date };

const asRow = (value: unknown): PreviewRow | null => {
  if (typeof value !== 'object' || value === null) return null;
  const row = value as Record<string, unknown>;
  return typeof row.id === 'string' && row.createdAt instanceof Date ? (row as PreviewRow) : null;
};

/**
 * Le dernier message SERVABLE à ce lecteur, par conversation de la page.
 *
 * `conversations` porte les lignes déjà lues avec
 * {@link CONVERSATION_LAST_MESSAGE_PREVIEW_QUERY} : la lecture d'aperçu
 * elle-même n'est pas refaite. Toutes les lectures de ce module sont bornées
 * par la page (cinq conversations), et un lecteur qui n'a rien masqué ni aucun
 * éphémère en aperçu n'en paie aucune qui rende quelque chose.
 */
export async function resolveDashboardPreviews(
  prisma: PrismaClient,
  params: { readonly userId: string; readonly conversations: readonly DashboardConversationRow[] },
): Promise<ReadonlyMap<string, DashboardPreview>> {
  const previews = new Map<string, DashboardPreview>();
  const conversationIds = params.conversations.map((c) => c.id);
  if (conversationIds.length === 0) return previews;

  // La participation du LECTEUR dans chacune — c'est elle, et elle seule, qui
  // décide de son plancher ET porte sa clé d'éphémère. Bornée par la page (#4165).
  const memberships = await prisma.participant.findMany({
    where: {
      userId: params.userId,
      conversationId: { in: conversationIds },
      isActive: true,
      ...unsetOrNull('bannedAt'),
    },
    select: { id: true, conversationId: true, ...HISTORY_FLOOR_PARTICIPANT_SELECT },
    take: conversationIds.length,
  });
  const readerParticipantByConversation = new Map(memberships.map((m) => [m.conversationId, m.id] as const));

  const { floors, unreadableConversationIds } = await loadHistoryFloorsOrFail(prisma, memberships);
  const unreadable = new Set(unreadableConversationIds);

  // Un plancher illisible ⇒ aucun aperçu. Et une conversation dont le lecteur
  // n'a AUCUNE participation lisible non plus : elle n'aurait pas dû entrer
  // dans la page, et l'absence ne vaut pas autorisation.
  for (const id of conversationIds) {
    if (unreadable.has(id) || !readerParticipantByConversation.has(id)) previews.set(id, null);
  }

  const candidates = params.conversations
    .filter((c) => !previews.has(c.id))
    .map((c) => ({
      conversationId: c.id,
      message: asRow(c.messages[0]),
    }));

  // Masquage PERSONNEL et plancher, avec repli sur le message visible
  // précédent : la loi que `GET /conversations` et la recherche appellent déjà.
  const replacements = await resolveVisibleLastMessages(prisma, {
    userId: params.userId,
    candidates: candidates.map((c) => ({
      conversationId: c.conversationId,
      message: c.message ? { id: c.message.id, createdAt: c.message.createdAt } : null,
    })),
    query: { select: conversationLastMessagePreviewSelect as unknown as Record<string, unknown> },
    historyFloors: floors,
  });

  const kept: Array<{ conversationId: string; row: PreviewRow }> = [];
  for (const candidate of candidates) {
    const resolved = replacements.has(candidate.conversationId)
      ? asRow(replacements.get(candidate.conversationId))
      : candidate.message;
    if (!resolved) {
      previews.set(candidate.conversationId, null);
      continue;
    }
    kept.push({ conversationId: candidate.conversationId, row: resolved });
  }
  if (kept.length === 0) return previews;

  // #11381 — l'aperçu d'une conversation `server`/`hybrid` lit le clair, ou
  // sort SCELLÉ en le disant. Une seule passe pour la page.
  const opened = await revealAtRestRows(kept.map((k) => k.row), gatewayKeyring(prisma));
  const rows = kept.map((entry, index) => ({ ...entry, row: (asRow(opened[index]) ?? entry.row) }));

  const readerOf = (conversationId: string): string | undefined => readerParticipantByConversation.get(conversationId);
  const pairs = rows.map((entry) => ({ conversationId: entry.conversationId, message: entry.row }));

  // #7451, #8630, #7594 — l'échéance servie à CE lecteur, la mort héritée de ce
  // que l'aperçu CITE, et la vue unique qu'il a déjà ouverte. Trois unités
  // partagées avec la ligne de liste, appelées dans le même ordre.
  const [servedExpiries, inheritedDeaths, consumedViewOnce] = await Promise.all([
    loadListEphemeralExpiries(prisma, pairs as never, readerOf),
    loadListInheritedExpiries(prisma, pairs as never, readerOf),
    loadViewOnceConsumptions(
      prisma,
      rows.flatMap((entry) => {
        const participantId = readerOf(entry.conversationId);
        return entry.row.isViewOnce === true && participantId
          ? [{ messageId: entry.row.id, participantId }]
          : [];
      }),
      (error) => logger.warn('view-once consumption read failed', { error }),
    ),
  ]);

  for (const entry of rows) {
    const message = entry.row;
    const ownExpiresAt = servedExpiries.has(message.id) ? servedExpiries.get(message.id) ?? null : undefined;
    const quotedDeathAt = inheritedDeaths.get(message.id) ?? null;
    const servedExpiresAt = quotedDeathAt ? inheritedEphemeralExpiresAt([ownExpiresAt, quotedDeathAt]) : ownExpiresAt;
    const protection = resolvePreviewProtection({ ...message, servedExpiresAt, quotedDeathAt } as never);
    const readerParticipantId = readerOf(entry.conversationId);

    previews.set(
      entry.conversationId,
      projectListLastMessageBody(message as never, {
        protection,
        servedExpiresAt,
        viewOnceConsumed:
          readerParticipantId !== undefined
          && consumedViewOnce.has(viewOnceConsumptionKey({ messageId: message.id, participantId: readerParticipantId })),
      }) as unknown as Record<string, unknown>,
    );
  }

  return previews;
}
