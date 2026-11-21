import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { enhancedLogger } from '../../utils/logger-enhanced';

const logger = enhancedLogger.child({ module: 'accountParticipantIds' });

/** Ce que ce module demande à Prisma, et rien de plus. */
export type AccountParticipantPrisma = Pick<PrismaClient, 'participant'>;

/**
 * **LES SIÈGES D'UN COMPTE — une seule question, un seul `where` (#20129).**
 *
 * Trois sites lisaient « les identifiants de participation de ce compte » avec
 * trois clauses différentes : `{ userId, type: 'user' }` pour l'export,
 * `{ userId }` pour la purge, `{ userId }` pour la télémétrie d'appel. Aucun
 * témoin ne voyait la divergence, et elle était un PIÈGE ARMÉ : dix lignes sous
 * la clause de l'export, la section `contacts` écrit
 * `{ userId, type: 'user', isActive: true }` — le jour où quelqu'un les aligne
 * « par cohérence », les médias transférés dans les conversations que le compte
 * a QUITTÉES disparaissent de l'archive de l'art. 15, sans qu'un témoin tombe.
 *
 * **La clause est `{ userId }`, et le `type` n'en fait pas partie.** La question
 * posée ici est « quels sièges portent l'IDENTITÉ de ce compte ? » ; `type`
 * classe le siège (`user`, `anonymous`, `bot`), pas l'identité qu'il porte, et
 * `Participant.userId` n'est non nul que pour un siège qui en porte une. Le
 * resserrement est donc inerte sur l'arbre d'aujourd'hui — mesuré : aucun chemin
 * ne pose `userId` sur un participant `anonymous` (`link-admission-guest.ts`),
 * aucun `participant.update` ne le pose après coup, et il n'existe aucun
 * écrivain de siège `bot` — et il cesse d'être une divergence à aligner un jour
 * dans le mauvais sens.
 */
/**
 * **Le `where` est écrit LITTÉRALEMENT aux deux lectures ci-dessous, et c'est
 * une décision.** Il avait d'abord été hissé dans un `accountSeatsWhere(userId)`
 * partagé — ce qui rendait les deux lectures ILLISIBLES au cliquet des audiences
 * (`conversation-audience-living-participation`), dont le discriminant ne peut
 * pas traverser un appel : il les publiait en `appel`, et son plafond de
 * lectures non jugeables montait de 52 à 54. Un cliquet d'inventaire ne se
 * relâche pas pour faire de la place à du code neuf.
 *
 * La loi tient donc par le MODULE, pas par un helper : les deux lectures vivent
 * à trente lignes l'une de l'autre, personne d'autre ne les écrit (un témoin de
 * source le garde), et chacune est jugeable là où elle est posée.
 */

/**
 * La liste ENTIÈRE, pour un appelant qui la lit une fois et la partage.
 *
 * Non bornée, et c'est une dette HÉRITÉE, pas une nouvelle : `me/export.ts`
 * portait déjà cette lecture (gelée à 2 `findMany` nus par
 * `unbounded-findmany-guard.test.ts`, qui ne balaie que `routes/`) et la
 * réutilise pour `messages`, `reactions`, `media` et, depuis ce lot, les appels.
 * Un balayage de FOND n'a pas le droit de s'en servir : il pagine
 * ({@link accountSeatIdBatches}).
 */
export async function accountSeatIds(prisma: AccountParticipantPrisma, userId: string): Promise<string[]> {
  const seats = await prisma.participant.findMany({
    where: { userId },
    select: { id: true },
  });
  return seats.map((seat) => seat.id);
}

/** Sièges lus par fournée : une liste bornée, jamais un `findMany` nu. */
const SEAT_BATCH = 200;

/**
 * Le PLAFOND de pages, et il n'est pas une précaution de style.
 *
 * Cette descente tourne dans la passe HORAIRE de maintenance. Un `for (;;)` dont
 * la sortie dépend de la réponse d'une dépendance n'a aucune borne de vivacité :
 * une page qui ne progresse pas — un double de test, un connecteur qui ignore
 * `skip`, un index en cours de reconstruction — y boucle pour toujours, et la
 * passe ne rend jamais la main.
 *
 * Mesuré par l'audit adversarial du lot : retirer `skip += rows.length` faisait
 * boucler indéfiniment, et le témoin qui l'attrapait PENDAIT au lieu de rougir —
 * ce qui ne se distingue pas, en CI, d'un environnement cassé.
 *
 * Le plafond rend donc la panne LISIBLE : la descente s'arrête, elle le dit
 * (`complete: false`), et le témoin tombe en une seconde. 10 000 sièges à 200
 * par fournée sont 50 pages ; 500 laissent deux ordres de grandeur de marge sur
 * le compte le plus bavard imaginable.
 */
const MAX_SEAT_PAGES = 500;

/**
 * Les mêmes, par FOURNÉES, pour un balayage de fond qui n'a que son `userId` en
 * main (la purge de fin de période de grâce).
 *
 * Pourquoi des fournées : le nombre de participations d'un compte est le nombre
 * de conversations qu'il a rejointes — borné par construction, mais par rien
 * d'écrit. Un `take` SEUL tronquerait en silence, c'est-à-dire laisserait des
 * octets d'un compte supprimé hors de portée de tout balayage futur, après que
 * `privacy.json` a promis « suppression définitive ».
 *
 * Stable sans curseur : rien ne supprime de ligne `Participant` pendant la
 * purge — `purgeAccountIsolatedData` les garde délibérément, « ce qu'un AUTRE
 * participant continue de VOIR ».
 *
 * **Le drapeau `complete` est la moitié qui compte.** Une lecture en échec rend
 * `complete: false` et ARRÊTE la descente : l'appelant purge ce qu'il a (son
 * espace nominal au minimum, puisque `uploadedByOfAccount` y ajoute toujours le
 * compte), et il doit DIRE que son balayage était incomplet. Il n'y a pas de
 * passe suivante : `processAccountDeletionRequests` n'élit que les demandes
 * `CONFIRMED`, et la demande ne l'est plus — rejouer une étape jusqu'au succès
 * est #10021. Annoncer un rejeu qui n'existe pas est plus coûteux que l'annoncer
 * perdu.
 */
export async function* accountSeatIdBatches(
  prisma: AccountParticipantPrisma,
  userId: string,
  batchSize: number = SEAT_BATCH
): AsyncGenerator<{ readonly ids: readonly string[]; readonly complete: boolean }> {
  let skip = 0;
  let yielded = false;

  for (let page = 0; ; page += 1) {
    if (page >= MAX_SEAT_PAGES) {
      logger.error('account seats pagination hit its page ceiling — sweep is INCOMPLETE (#10021)', {
        userId,
        seatsAlreadyServed: skip,
        maxPages: MAX_SEAT_PAGES,
      });
      yield { ids: [], complete: false };
      return;
    }

    let rows: Array<{ id: string }>;
    try {
      rows = await prisma.participant.findMany({
        where: { userId },
        select: { id: true },
        orderBy: { id: 'asc' },
        take: batchSize,
        skip,
      });
    } catch (error: unknown) {
      // Le journal dit où la descente s'est arrêtée : « le compte seul » est
      // faux dès que des fournées ont déjà servi, et c'est le seul diagnostic
      // qu'un humain lira.
      logger.error('account seats lookup failed — sweep is INCOMPLETE, no later pass will retry (#10021)', {
        userId,
        seatsAlreadyServed: skip,
        error,
      });
      yield { ids: [], complete: false };
      return;
    }

    if (rows.length === 0) {
      if (!yielded) yield { ids: [], complete: true };
      return;
    }

    yield { ids: rows.map((row) => row.id), complete: true };
    yielded = true;

    if (rows.length < batchSize) return;
    skip += rows.length;
  }
}
