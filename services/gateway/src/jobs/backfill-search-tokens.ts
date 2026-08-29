import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { logger } from '../utils/logger';
import { searchTokensFor } from '../utils/search-tokens';

/** Combien de comptes traiter par tour — borne la mémoire et la durée d'un lot. */
const TAILLE_LOT = 200;
/**
 * Plafond de tours par démarrage. Un rattrapage qui n'a pas fini reprend au
 * boot suivant : mieux vaut plusieurs démarrages qu'un démarrage qui ne rend
 * jamais la main.
 */
const TOURS_MAX = 500;

/**
 * Remplit `searchTokens` pour les comptes créés avant l'existence de la colonne.
 *
 * ## Pourquoi au DÉMARRAGE, et sans porte de premier boot
 *
 * Une route de recherche adossée à un index vide ne trouve personne. Le
 * rattrapage doit donc précéder l'usage, pas l'accompagner.
 *
 * Il n'est PAS placé derrière une garde « base vide » : le dépôt a déjà payé ce
 * piège avec `ensurePostGeoIndex`, resté sous `shouldInitialize()` et donc jamais
 * exécuté en production, jusqu'à ce que `/posts/nearby` rende 500. Une garde de
 * premier boot sur un rattrapage rétroactif est une contradiction : par
 * définition, il s'applique à une base qui contient déjà des données.
 *
 * ## Idempotent, et ce que cela coûte
 *
 * Il ne traite que les lignes dont les jetons manquent. Une fois le rattrapage
 * fait, chaque démarrage coûte une requête qui ne rend rien. C'est le prix d'un
 * rattrapage qui n'a pas besoin qu'on se souvienne de le lancer.
 */
export async function backfillSearchTokens(prisma: PrismaClient): Promise<number> {
  let traites = 0;

  for (let tour = 0; tour < TOURS_MAX; tour++) {
    // `isEmpty: true` seul ne suffirait pas : sur le connecteur MongoDB, un
    // filtre scalaire ne matche pas les documents où le champ est ABSENT — et
    // c'est précisément le cas des lignes créées avant la colonne (leçon 307).
    const lot = await prisma.user.findMany({
      where: {
        OR: [
          { searchTokens: { isEmpty: true } },
          { searchTokens: { isSet: false } },
        ],
      },
      select: { id: true, username: true, displayName: true, firstName: true, lastName: true },
      take: TAILLE_LOT,
    } as never);

    if (lot.length === 0) break;

    await Promise.all(
      (lot as Array<{ id: string; username: string; displayName: string | null; firstName: string | null; lastName: string | null }>)
        .map((compte) =>
          prisma.user.update({
            where: { id: compte.id },
            data: { searchTokens: searchTokensFor(compte) },
          })
        )
    );

    traites += lot.length;

    // Un compte dont les quatre champs de nom sont vides rend un tableau vide,
    // et serait donc resélectionné au tour suivant : la boucle tournerait sans
    // fin. Le lot incomplet est la seule condition d'arrêt sûre.
    if (lot.length < TAILLE_LOT) break;
  }

  if (traites > 0) {
    logger.info(`[BackfillSearchTokens] ${traites} compte(s) indexé(s) pour la recherche`);
  }

  return traites;
}
