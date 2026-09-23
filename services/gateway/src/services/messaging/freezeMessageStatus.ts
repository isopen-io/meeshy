import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { normalizeLanguageCode } from '@meeshy/shared/utils/language-normalize';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { unsetOrNull } from '../../utils/prisma-unset';
import { MAX_VIEWED_LANGUAGES, mergeViewedLanguages } from '../../utils/viewed-languages';
import { startEphemeralCountdowns } from './ephemeralCountdown';

const logger = enhancedLogger.child({ module: 'freezeMessageStatus' });

/**
 * Le GEL des dates de livraison et de lecture, par message et par participant.
 *
 * Extrait de `MessageReadStatusService` (#7451) : le service hôte pèse 2 600
 * lignes, deux fois le plafond de 1 200, et la directive interdit d'y AJOUTER
 * avant d'en avoir extrait. Ce lot devait justement y ajouter — c'est ici que
 * naît la PREMIÈRE RÉCEPTION d'un message par un destinataire, donc le seul
 * endroit du dépôt qui sache qu'un décompte éphémère vient de démarrer.
 *
 * ─── POURQUOI LE DÉCOMPTE PART D'ICI, ET DE NULLE PART AILLEURS ─────────────
 *
 * Cinq chemins marquent un message comme reçu — livraison en direct, vidage de
 * la file hors ligne, `GET .../messages`, `POST .../receipts`, NSE — et tous les
 * cinq convergent sur `markMessagesAsReceived`, donc sur cette fonction. Poser
 * le décompte chez l'un d'eux aurait laissé les quatre autres muets : c'est la
 * forme exacte de « une garde d'admission se pose sur CHAQUE chemin, pas sur le
 * plus fréquenté » (§ `services/gateway/CLAUDE.md`), vue depuis le point où les
 * chemins se rejoignent plutôt que depuis chacun d'eux.
 *
 * Et c'est ici, pas dans `markMessagesAsReceived`, parce que « première »
 * réception est une propriété que SEULE l'écriture write-once connaît : la
 * méthode appelante ne sait que « le curseur a avancé », ce qui est vrai à
 * chaque ouverture de conversation.
 */

/** La surface Prisma du gel — `message` pour la fenêtre, `messageStatusEntry` pour les lignes. */
export type FreezeStatusPrisma = Pick<PrismaClient, 'message' | 'messageStatusEntry' | 'participant'>;

export interface FreezeMessageStatusParams {
  readonly participantId: string;
  readonly conversationId: string;
  readonly since: Date | null;
  readonly at: Date;
  readonly field: 'readAt' | 'deliveredAt';
  /**
   * Restreint le gel aux messages réellement affichés. Une liste VIDE est
   * significative — « rien n'a été affiché » — et ne retombe donc pas sur la
   * fenêtre. Seule l'absence du paramètre déclenche le repli historique.
   * Réservé à `readAt` : un message récupéré est livré même s'il n'a jamais été
   * affiché, donc la fenêtre reste correcte pour `deliveredAt`.
   */
  readonly messageIds?: readonly string[];
  /**
   * Version linguistique affichée au lecteur. Contrairement à l'horodatage,
   * elle n'est PAS write-once : un lecteur qui bascule sur la traduction a
   * réellement consulté les deux versions, et les deux doivent apparaître.
   * Ignorée pour `deliveredAt` — une livraison n'a pas de langue.
   */
  readonly language?: string | null;
  /**
   * EXCEPTIONS à `language`, par message. La langue rendue n'est pas toujours
   * celle que le lecteur préfère : sans traduction disponible, c'est l'ORIGINAL
   * qui s'affiche. Le client ne déclare que ce qui diffère.
   */
  readonly messageLanguages?: Readonly<Record<string, string>>;
}

/** @returns nombre d'entrées RÉELLEMENT figées par cet appel. */
export async function freezeMessageStatus(
  prisma: FreezeStatusPrisma,
  params: FreezeMessageStatusParams,
): Promise<number> {
  const { participantId, conversationId, since, at, field, messageIds } = params;
  const defaultLanguage =
    field === 'readAt' ? normalizeLanguageCode(params.language) : undefined;
  const perMessage = field === 'readAt' ? params.messageLanguages : undefined;
  const languageFor = (messageId: string): string | undefined =>
    normalizeLanguageCode(perMessage?.[messageId]) ?? defaultLanguage;
  const anyLanguage = Boolean(defaultLanguage) || Boolean(perMessage && Object.keys(perMessage).length);
  try {
    const messages = await prisma.message.findMany({
      where: {
        // Ces trois gardes tiennent dans les deux modes : une liste d'ids
        // forgée par un client ne permet pas de marquer lu un message d'une
        // autre conversation, supprimé, ou émis par le participant lui-même.
        conversationId,
        deletedAt: null,
        senderId: { not: participantId },
        ...(messageIds
          ? { id: { in: [...messageIds] } }
          : { createdAt: { lte: at, ...(since ? { gt: since } : {}) } }),
      },
      select: { id: true },
    });

    if (messages.length === 0) return 0;
    const ids = messages.map((m) => m.id);

    const existing = await prisma.messageStatusEntry.findMany({
      where: { messageId: { in: ids }, participantId },
      select: {
        messageId: true,
        deliveredAt: true,
        readAt: true,
        viewedLanguages: true,
      },
    });
    const existingIds = new Set(existing.map((e) => e.messageId));
    const toCreate = ids.filter((id) => !existingIds.has(id));

    let frozen = 0;
    if (toCreate.length > 0) {
      const created = await prisma.messageStatusEntry.createMany({
        // Les colonnes de l'AUTRE moitié sont écrites explicitement à `null` :
        // la discipline d'ÉCRITURE que `utils/prisma-unset.ts` nomme comme la
        // jumelle du prédicat de lecture. Le prédicat rend exactes les lignes
        // DÉJÀ en base ; ceci rend exactes celles à venir.
        data: toCreate.map((messageId) =>
          field === 'readAt'
            ? {
                messageId,
                conversationId,
                participantId,
                readAt: at,
                deliveredAt: null,
                receivedAt: null,
                ...(languageFor(messageId)
                  ? { viewedLanguages: [languageFor(messageId) as string] }
                  : {}),
              }
            : {
                messageId,
                conversationId,
                participantId,
                deliveredAt: at,
                receivedAt: at,
                readAt: null,
              },
        ),
      });
      frozen += created?.count ?? toCreate.length;
    }

    // Write-once: ne renseigne le champ que sur les entrées où il est encore
    // nul (ex: une entrée créée par la livraison reçoit ensuite son `readAt`).
    const toUpdate = existing
      .filter((e) => (field === 'readAt' ? e.readAt === null : e.deliveredAt === null))
      .map((e) => e.messageId);

    if (toUpdate.length > 0) {
      // `unsetOrNull`, et jamais `{ champ: null }` : l'entrée à compléter a été
      // créée par l'AUTRE moitié de ce gel — la livraison écrit `deliveredAt`
      // /`receivedAt` sans jamais nommer `readAt`, donc la colonne est ABSENTE
      // du document, et une ÉGALITÉ à `null` ne l'apparie pas sur MongoDB
      // (`utils/prisma-unset.ts`). Le filtre JS juste au-dessus, lui, voyait
      // bien `null` — Prisma relit une colonne absente en `null` —, si bien
      // que `toUpdate` portait les cinq messages et que l'écriture n'en
      // touchait aucun : `markedCount: 0` sur un lot parfaitement légitime,
      // et pas un `readAt` gravé. C'est le défaut mesuré sur staging (#7345),
      // sur la séquence NOMINALE : un message est livré avant d'être lu.
      const updated = await prisma.messageStatusEntry.updateMany({
        where:
          field === 'readAt'
            ? { messageId: { in: toUpdate }, participantId, ...unsetOrNull('readAt') }
            : { messageId: { in: toUpdate }, participantId, ...unsetOrNull('deliveredAt') },
        data: field === 'readAt' ? { readAt: at } : { deliveredAt: at, receivedAt: at },
      });
      frozen += updated?.count ?? toUpdate.length;
    }

    // La langue s'UNIONNE, là où l'horodatage se fige. Seules les entrées qui
    // ne la connaissent pas encore sont réécrites : sur le chemin courant — le
    // lecteur ne change pas de langue entre deux lots — cette passe n'écrit
    // rien du tout. Les entrées créées ci-dessus l'ont déjà reçue.
    if (anyLanguage) {
      // Regroupé par langue : un lot lu d'une traite n'en compte qu'une, donc
      // un seul `updateMany`. Les exceptions (message resté dans sa langue
      // d'origine faute de traduction) forment les groupes suivants.
      const byLanguage = new Map<string, string[]>();
      for (const entry of existing) {
        const code = languageFor(entry.messageId);
        if (!code) continue;
        // Re-normalise l'existant via le SSOT avant la dédup : une locale
        // complète héritée (`fr-FR`) désigne la même version que `fr`, et ne
        // doit ni rouvrir un push doublon ni gonfler le plafond.
        const known = mergeViewedLanguages(entry.viewedLanguages, []);
        if (known.includes(code)) continue;
        if (known.length >= MAX_VIEWED_LANGUAGES) continue;
        byLanguage.set(code, [...(byLanguage.get(code) ?? []), entry.messageId]);
      }

      for (const [code, ids] of byLanguage) {
        await prisma.messageStatusEntry.updateMany({
          where: { messageId: { in: ids }, participantId },
          data: { viewedLanguages: { push: code } },
        });
      }
    }

    // ── LE DÉCOMPTE ÉPHÉMÈRE (#7451) ────────────────────────────────────────
    //
    // `toCreate` ∪ `toUpdate` EST l'ensemble des messages dont ce participant
    // vient de graver la PREMIÈRE réception — ni plus (les entrées déjà
    // pourvues ont été filtrées juste au-dessus), ni moins (les deux moitiés du
    // gel sont là). Aucun autre point du dépôt ne connaît cet ensemble.
    //
    // APRÈS le gel, jamais avant : `startEphemeralCountdowns` dérive `D(u)` de
    // `receivedAt`, qu'il vient d'écrire, et relit les entrées des AUTRES
    // destinataires pour l'échéance servie à l'expéditeur.
    //
    // Best-effort, comme tout ce qui suit le gel : un décompte non posé est
    // repris au prochain accusé de réception du même participant, et le
    // balayage de rétention borne le pire cas. Le faire échouer prendrait en
    // otage l'accusé de livraison lui-même.
    if (field === 'deliveredAt') {
      const received = [...toCreate, ...toUpdate];
      if (received.length > 0) {
        await startEphemeralCountdowns(prisma, {
          participantId,
          conversationId,
          messageIds: received,
          at,
        });
      }
    }

    return frozen;
  } catch (error) {
    logger.error(
      `[MessageReadStatus] freezeMessageStatus(${field}) failed for participant ${participantId} in conversation ${conversationId}:`,
      error,
    );
    // Ne jette jamais : une erreur de gel ne doit pas faire échouer le
    // marquage du curseur. Rien n'a été figé, le compte est donc nul.
    return 0;
  }
}
