/**
 * Le calcul de non-lu, UNE fois (#7199 / G2).
 *
 * `MessageReadStatusService.getUnreadCountsForParticipants` (une conversation,
 * plusieurs participants — alimente `conversation:unread-updated`, le push
 * temps réel sur CHAQUE `message:new`) et `.getUnreadCountsForUser` (un
 * utilisateur, plusieurs conversations — alimente la liste) répondaient à la
 * MÊME question — « combien de messages d'autrui, après mon plancher de
 * lecture, hors ce que j'ai masqué pour moi-même ? » — avec deux algorithmes
 * distincts : un `message.findMany` batché + recherche binaire en mémoire
 * ici, N `message.count()` filtrés côté base là. Le doc-comment historique de
 * `getUnreadCountsForParticipants` assumait la divergence : « Fixing one
 * alone would replace a wrong-but-stable badge with a badge that changes
 * value depending on which path last spoke. »
 *
 * Les deux plancher-mêlages (lecture, masquage) convergent déjà vers le MÊME
 * seuil — `exclusiveFloorMsFor` restitue le cutoff `applyPersonalHistoryHiding`
 * en `cutoff.getTime() - 1` comparé par `>` strict, exactement ce que
 * `createdAt: { gte: cutoff }` exprime côté base (voir son doc-comment). Ce
 * qui manquait n'était donc pas un correctif de VALEUR, mais l'unification :
 * ce module est le SEUL endroit qui calcule un compte de non-lus depuis un
 * plancher, et les deux méthodes du service en deviennent des orchestrateurs
 * (résolution des participants/conversations, chargement des curseurs et du
 * masquage — qui restent scopés différemment par appelant) autour de lui.
 *
 * Extrait de `MessageReadStatusService.ts` (2683 lignes, hors budget des
 * 1200 lignes — CLAUDE.md : « un fichier déjà hors budget reste interdit
 * d'ajout : on extrait d'abord, on ajoute ensuite »).
 */

import type { PrismaClient } from "@meeshy/shared/prisma/client";
import { logger } from "../utils/logger";
import { exclusiveFloorMsFor, type PersonalHistoryHiding } from "./personalHistoryFilter";

/**
 * Le plancher de comptage résolu d'un participant, prêt pour
 * `computeUnreadCounts` : la position de lecture (curseur, ou `joinedAt` à
 * défaut) et le cutoff de masquage personnel fusionnés en UNE borne
 * exclusive (`Math.max`, en millisecondes entières — voir
 * `exclusiveFloorMsFor`) ; les messages masqués individuellement ne se
 * fusionnent pas dans une borne (appartenance à un ensemble, pas un
 * intervalle) et voyagent à part.
 */
export interface UnreadFloor {
  readonly id: string;
  readonly floorMs: number | null;
  readonly hiddenMessageIds: ReadonlySet<string> | null;
}

/**
 * Résout le plancher d'UN participant. `cursorFloor` est déjà réduit par
 * l'appelant à `lastReadMessageCreatedAt ?? lastReadAt` (la position
 * CHRONOLOGIQUE du curseur, jamais l'horloge murale — un message sauté par
 * une lecture exacte-partielle reste compté, cf. design lecture-exacte §3).
 */
export function unreadFloorFor(
  participant: { readonly id: string; readonly joinedAt: Date | null },
  cursorFloor: Date | null,
  hiding: PersonalHistoryHiding
): UnreadFloor {
  const readFloorMs = (cursorFloor ?? participant.joinedAt)?.getTime() ?? null;
  const cutoffMs = exclusiveFloorMsFor(hiding);
  const floorMs =
    cutoffMs === null ? readFloorMs : readFloorMs === null ? cutoffMs : Math.max(readFloorMs, cutoffMs);
  return {
    id: participant.id,
    floorMs,
    hiddenMessageIds: hiding.hiddenMessageIds.length > 0 ? new Set(hiding.hiddenMessageIds) : null,
  };
}

/**
 * ONE `message.findMany` pour tous les `floors` d'UNE conversation +
 * comptage par recherche binaire en mémoire.
 *
 * La borne inférieure de la requête est le plancher le PLUS ANCIEN parmi
 * `floors` (un plancher `null` — jamais lu, pas de `joinedAt` — la fait
 * sauter entièrement) : un seul aller-retour base sert tous les appelants,
 * chacun recomptant ensuite sur son propre plancher en mémoire.
 *
 * `needsMessageIds` ne demande la colonne `id` que si au moins un floor porte
 * un masquage individuel — la grande majorité des lectures n'en a pas besoin.
 *
 * Réduction (jamais `Math.min(...spread)`) : `floors` porte une entrée par
 * participant/conversation appelant, et une conversation publique à l'échelle
 * 100k+ peut dépasser le plafond d'argument-spread de V8 (~131k) — `reduce`
 * est O(n) sans coût de pile par argument, valable pour toute taille de
 * groupe.
 *
 * Renvoie `Map<floor.id, compte>` — une carte à zéro (mêmes clés) sur tout
 * échec base : un badge à 0 est faux, un écran qui explose est pire.
 */
export async function computeUnreadCounts(
  prisma: PrismaClient,
  conversationId: string,
  floors: ReadonlyArray<UnreadFloor>
): Promise<Map<string, number>> {
  if (floors.length === 0) return new Map();

  try {
    const needsMessageIds = floors.some((f) => f.hiddenMessageIds !== null);

    const hasUnboundedFloor = floors.some((f) => f.floorMs === null);
    const minFloorMs = hasUnboundedFloor
      ? null
      : floors.reduce(
          (min, f) => ((f.floorMs as number) < min ? (f.floorMs as number) : min),
          Infinity
        );

    const rows = (await prisma.message.findMany({
      where: {
        conversationId,
        deletedAt: null,
        ...(minFloorMs !== null ? { createdAt: { gt: new Date(minFloorMs) } } : {}),
      },
      select: needsMessageIds
        ? { id: true, createdAt: true, senderId: true }
        : { createdAt: true, senderId: true },
      orderBy: { createdAt: "asc" },
    })) as Array<{ id?: string; createdAt: Date; senderId: string }>;

    // Tous les horodatages candidats (ascendant) + des paquets par expéditeur,
    // pour soustraire les messages PROPRES de chaque participant. `countAbove`
    // suppose un ordre ascendant et tourne sur `allTimestamps` ET chaque
    // paquet — les deux doivent donc être triés, même si la base rend déjà
    // l'ordre de l'index : un filet défensif qui garde le compte juste quel
    // que soit l'ordre de retour des lignes.
    const allTimestamps = rows.map((r) => r.createdAt.getTime()).sort((a, b) => a - b);
    const bySender = new Map<string, number[]>();
    for (const r of rows) {
      const bucket = bySender.get(r.senderId);
      if (bucket) bucket.push(r.createdAt.getTime());
      else bySender.set(r.senderId, [r.createdAt.getTime()]);
    }
    for (const bucket of bySender.values()) bucket.sort((a, b) => a - b);

    // countAbove(ts, F) = nombre d'horodatages strictement > F. Recherche
    // binaire par borne supérieure sur un tableau ascendant. `>` strict reflète
    // `createdAt: { gt: floor }` (un message exactement au plancher n'est pas
    // compté). Un plancher `null` compte le tableau entier.
    const countAbove = (sorted: number[], floorMs: number | null): number => {
      if (floorMs === null) return sorted.length;
      let lo = 0;
      let hi = sorted.length;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (sorted[mid] > floorMs) hi = mid;
        else lo = mid + 1;
      }
      return sorted.length - lo;
    };

    // Un participant qui a masqué des messages individuellement ne peut pas
    // être compté par une borne — l'appartenance à un ensemble n'est pas un
    // intervalle — donc il retombe sur un passage linéaire sur les mêmes
    // lignes. `hiddenMessageIds !== null` implique `needsMessageIds`, donc
    // `r.id` est présent exactement là où il est lu.
    const countExcludingHidden = (f: UnreadFloor, hidden: ReadonlySet<string>): number =>
      rows.filter(
        (r) =>
          r.senderId !== f.id &&
          (f.floorMs === null || r.createdAt.getTime() > f.floorMs) &&
          !hidden.has(r.id as string)
      ).length;

    // unread(f) = (tous les messages après le plancher de f) − (les messages
    // PROPRES de f après son plancher). `allTimestamps` et chaque paquet sont
    // triés ascendant ci-dessus, la même recherche binaire est donc valide
    // sur l'un comme sur l'autre.
    return new Map(
      floors.map((f) => {
        if (f.hiddenMessageIds !== null) return [f.id, countExcludingHidden(f, f.hiddenMessageIds)];
        const own = bySender.get(f.id) ?? [];
        return [f.id, countAbove(allTimestamps, f.floorMs) - countAbove(own, f.floorMs)];
      })
    );
  } catch (error) {
    logger.error("[unreadCountsCore] Error computing unread counts", error);
    return new Map(floors.map((f) => [f.id, 0]));
  }
}
