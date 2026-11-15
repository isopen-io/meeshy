import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { QueuedMessagePayload } from '@meeshy/shared/types/delivery-queue';
import {
  HISTORY_FLOOR_PARTICIPANT_SELECT,
  type HistoryFloorParticipation,
} from '../services/historyFloor';
import { dropQueuedEntriesBelowHistoryFloor, type DrainFloorRefusal } from './drainHistoryFloor';
import type { QueuedMessageFacts } from './queuedMessageFacts';

/**
 * L'AUTORISATION du rejeu hors ligne : les deux questions que le drain doit
 * poser à l'autorité AVANT toute émission, et l'unique lecture qui y répond.
 *
 *  1. **l'APPARTENANCE** — ce lecteur est-il encore un participant vivant, non
 *     banni, de cette conversation ? (la garde d'origine) ;
 *  2. **le PLANCHER D'HISTOIRE** — ce message est-il au-dessus du plancher de ce
 *     lecteur, tel que la base le dit MAINTENANT ? (#18615).
 *
 * Les deux se lisent sur la MÊME ligne `Participant`, et ce module existe pour
 * qu'elle ne soit lue qu'une fois : le drain est le chemin de la tempête de
 * reconnexions, et la lecture s'agrège déjà sur toutes les conversations du lot.
 * « Avant de conclure qu'une garde coûterait une requête, regarder ce que le
 * site lit déjà » — ici elle n'en coûte AUCUNE, seulement six colonnes de plus
 * sur une requête existante.
 *
 * ─── Pourquoi un module, et pas deux méthodes du manager ─────────────────────
 *
 * `MeeshySocketIOManager.ts` est hors budget de taille (3 659 lignes pour un
 * plafond dur de 1 200) : on extrait d'abord, on ajoute ensuite. La garde
 * d'appartenance vivait là en méthode privée avec son doc-comment ; elle y
 * était aussi la SEULE réponse à « qui a le droit de recevoir ce rejeu ? », si
 * bien que la seconde question n'avait pas d'endroit où se poser. Une règle qui
 * doit être retapée à chaque site est une règle qu'un site finira par ne pas
 * avoir.
 *
 * ─── Les deux postures d'échec, et elles DIVERGENT ───────────────────────────
 *
 * | lecture | possédée par | échec |
 * |---|---|---|
 * | la ligne PARTICIPANT | ce module, pour les deux gates | **OUVERT** — arbitrage d'origine, inchangé |
 * | la ligne du LIEN | le gate de plancher | **FERMÉ**, borné aux participations dont le lien décidait |
 * | la DATE du message | le gate de plancher | **FERMÉ**, borné aux conversations qui ONT un plancher |
 *
 * Le fail-OPEN de la première est l'arbitrage écrit depuis l'origine, et il est
 * juste pour ce qu'il vise : « une absence de réponse n'autorise rien à
 * conclure », le drain est DESTRUCTIF, et jeter l'arriéré parce que la base n'a
 * pas répondu échangerait une fuite rare contre une perte probable. Ajouter une
 * question à une lecture ne change pas la posture de cette lecture — et sous
 * cette panne-là, ce que le plancher laisserait passer est strictement INCLUS
 * dans ce que l'appartenance laisse déjà passer.
 *
 * ─── L'ordre : l'autorisation précède le contenu ─────────────────────────────
 *
 * Les deux gates de ce module tournent AVANT la garde de vivacité
 * (`queuedMessageLiveness`), qui interroge le MONDE et non l'autorité. C'est
 * l'ordre que le drain énonce déjà, et il a un effet de bord utile : la vivacité
 * n'a plus à interroger les entrées que l'autorisation vient de retirer.
 */

/** Le lecteur, par sa CLÉ DE FILE — `userId` pour un inscrit, `Participant.id` pour un invité de lien. */
export type DrainReader = {
  readonly key: string;
  readonly isAnonymous: boolean;
};

export type DrainAuthorizationPrisma = Pick<PrismaClient, 'participant' | 'conversationShareLink'>;

export type DrainAuthorization = {
  readonly kept: QueuedMessagePayload[];
  /** Les conversations dont l'appartenance a pris fin — journalisées par l'appelant. */
  readonly endedConversationIds: readonly string[];
  /** Combien d'entrées ce seul gate a retirées — le journal ne le recalcule pas par soustraction. */
  readonly endedEntryCount: number;
  readonly flooredRefusals: readonly DrainFloorRefusal[];
};

type ParticipationRow = HistoryFloorParticipation & { readonly bannedAt: Date | null };

export async function authorizeDrainedEntries(params: {
  readonly prisma: DrainAuthorizationPrisma;
  readonly reader: DrainReader;
  readonly entries: QueuedMessagePayload[];
  readonly facts: QueuedMessageFacts;
  readonly onParticipationReadFailure?: (error: unknown) => void;
}): Promise<DrainAuthorization> {
  const { prisma, reader, entries, facts } = params;
  const conversationIds = [...new Set(entries.map((entry) => entry.conversationId))];

  const participations = await readParticipations(prisma, reader, conversationIds).catch((error: unknown) => {
    params.onParticipationReadFailure?.(error);
    return null;
  });

  // Fail-OPEN : l'arbitrage d'origine de cette lecture, inchangé. Les deux gates
  // en dépendent, donc aucun des deux ne se prononce — et c'est le plus large
  // des deux, l'appartenance, qui décide de la posture.
  if (participations === null) {
    return { kept: entries, endedConversationIds: [], endedEntryCount: 0, flooredRefusals: [] };
  }

  // `bannedAt` est filtré en JS, pas dans le `where` : sous MongoDB un
  // `bannedAt: null` ne matche pas les documents où le champ est ABSENT (jamais
  // écrit), et exclurait donc les lignes historiques — le piège que `ban.ts`
  // documente déjà pour `leftAt` (audit C5).
  const live = participations.filter((row) => row.bannedAt == null);
  const liveIds = new Set(live.map((row) => row.conversationId));
  const authorized = liveIds.size === conversationIds.length
    ? entries
    : entries.filter((entry) => liveIds.has(entry.conversationId));

  const floored = await dropQueuedEntriesBelowHistoryFloor({
    prisma,
    participations: live,
    entries: authorized,
    facts,
  });

  return {
    kept: floored.kept,
    endedConversationIds: conversationIds.filter((id) => !liveIds.has(id)),
    endedEntryCount: entries.length - authorized.length,
    flooredRefusals: floored.refused,
  };
}

/**
 * La lecture UNIQUE. Son `select` tient ENSEMBLE ce que les deux gates
 * demandent — `bannedAt` pour l'appartenance, `HISTORY_FLOOR_PARTICIPANT_SELECT`
 * pour le plancher : c'est la projection trop étroite, pas l'appel manquant,
 * qui rend une règle inapplicable en aval sans qu'aucun témoin ne rougisse.
 *
 * **PRÉCONDITION, tenue par l'appelant** : chaque entrée porte un
 * `conversationId` de forme ObjectId (`isAddressableConversationId`). Elle n'est
 * pas cosmétique — les ids sont AGRÉGÉS en un seul `in`, donc une seule entrée
 * illisible fait lever la requête pour le lot ENTIER, et l'échec atterrit dans
 * le fail-open ci-dessus, qui rejoue tout SANS FILTRE. La garde vit donc chez
 * l'appelant, AVANT la requête : c'est le seul endroit où l'entrée fautive est
 * encore nommable une par une.
 *
 * La clé se branche sur la COLONNE que sa nature impose — `where: { userId }`
 * ne matche RIEN quand la clé porte un `Participant.id`, et le symptôme est une
 * liste VIDE, donc « aucun plancher », donc un fail-OPEN muet pour la population
 * DOMINANTE d'une conversation ouverte par lien de partage.
 */
async function readParticipations(
  prisma: DrainAuthorizationPrisma,
  reader: DrainReader,
  conversationIds: readonly string[],
): Promise<readonly ParticipationRow[]> {
  const rows = await prisma.participant.findMany({
    where: reader.isAnonymous
      ? { id: reader.key, conversationId: { in: [...conversationIds] }, isActive: true }
      : { userId: reader.key, conversationId: { in: [...conversationIds] }, isActive: true },
    select: { conversationId: true, bannedAt: true, ...HISTORY_FLOOR_PARTICIPANT_SELECT },
  });
  return rows as unknown as readonly ParticipationRow[];
}
