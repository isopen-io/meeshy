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
    // `findRaw`, et c'est la SEULE forme qui marche ici.
    //
    // Prisma n'exprime pas « ce champ est absent » sur une LISTE scalaire : ses
    // filtres de tableau sont `equals`, `has`, `hasEvery`, `hasSome`, `isEmpty`
    // — `isSet` n'appartient qu'aux scalaires optionnels, et le passer lève un
    // `PrismaClientValidationError` (mesuré en intégration : le rattrapage
    // échouait au démarrage, la colonne restait vide sur les 222 comptes, et la
    // recherche ne trouvait personne).
    //
    // `isEmpty: true` seul ne suffit pas non plus : en MongoDB, `$size: 0` ne
    // matche pas un document où le champ MANQUE — c'est-à-dire exactement les
    // lignes créées avant la colonne, donc toutes celles à rattraper.
    //
    // Un filtre brut est acceptable ici et nulle part ailleurs : ce n'est pas un
    // chemin chaud, il s'exécute une fois, et l'API typée ne peut pas dire cette
    // question.
    const brut = (await (prisma as unknown as {
      user: { findRaw: (args: unknown) => Promise<unknown> };
    }).user.findRaw({
      filter: { $or: [{ searchTokens: { $exists: false } }, { searchTokens: { $size: 0 } }] },
      options: { limit: TAILLE_LOT, projection: { _id: 1, username: 1, displayName: 1, firstName: 1, lastName: 1 } },
    })) as Array<Record<string, unknown>>;

    // `findRaw` rend le document MONGO : la clé est `_id`, pas `id`, et sa
    // valeur est un `{ $oid }`. Le confondre avec la forme Prisma ferait écrire
    // sur `undefined`.
    const lot = brut.map((doc) => ({
      id: typeof doc._id === 'object' && doc._id !== null
        ? String((doc._id as { $oid?: string }).$oid ?? doc._id)
        : String(doc._id),
      username: (doc.username as string | null) ?? null,
      displayName: (doc.displayName as string | null) ?? null,
      firstName: (doc.firstName as string | null) ?? null,
      lastName: (doc.lastName as string | null) ?? null,
    }));

    if (lot.length === 0) break;

    // Ligne par ligne, et TOLÉRANT : un `Promise.all` fait échouer le lot
    // ENTIER dès qu'une écriture rate, et le rattrapage s'arrête là.
    //
    // Ce n'est pas théorique — mesuré en intégration : un compte dont le
    // `phoneNumber` est stocké en NOMBRE au lieu d'une chaîne fait lever
    // `prisma.user.update` (« Failed to convert '237650159233' to 'String' »),
    // parce que Prisma relit la ligne après l'écriture. Une seule ligne
    // corrompue a laissé 23 comptes non indexés.
    //
    // Une donnée héritée abîmée ne doit pas empêcher les 199 autres d'être
    // rattrapées. Le suivi de la ligne elle-même est une issue à part.
    let echecs = 0;
    for (const compte of lot) {
      try {
        await prisma.user.update({
          where: { id: compte.id },
          data: { searchTokens: searchTokensFor({ ...compte, username: compte.username ?? undefined }) },
        });
        traites++;
      } catch (error) {
        echecs++;
        logger.warn(
          `[BackfillSearchTokens] compte ${compte.id} non indexé — ligne probablement corrompue`,
          { error: error instanceof Error ? error.message : String(error) }
        );
      }
    }

    // Un lot ENTIÈREMENT en échec boucle sans fin : les mêmes lignes
    // reviennent au tour suivant. C'est la seule condition d'arrêt qui protège
    // de ce cas.
    if (echecs === lot.length) {
      logger.error('[BackfillSearchTokens] lot entièrement en échec — arrêt du rattrapage');
      break;
    }

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
