import { createHash } from 'node:crypto';

import { TABLEAU } from './connecte/porte';
import { rendLePage } from './enveloppe/vue';
import { aUneSession } from './session';
import { documentDeLaVitrine } from './vitrine/vue';

/**
 * `/` — LA RACINE, ET SES DEUX LECTEURS.
 *
 * Le legacy servait ici DEUX écrans sous une seule adresse : la vitrine pour un
 * visiteur, le fil de la conversation « meeshy » pour un compte connecté
 * (`apps/web/app/page.tsx`). La v3 a hérité de cette responsabilité en prenant
 * `/`, et la tient maintenant des deux côtés — non plus par une redirection
 * vers le legacy, mais en SERVANT le tableau de bord.
 *
 * L'ÉCRAN CONNECTÉ N'EST PAS LE FIL, et c'est une décision du porteur
 * (2026-09-01) : « après la connexion la v3 va servir la nouvelle page dashboard
 * sur `/`, ainsi BubbleStreamPage disparaît ». Le tableau de bord récapitule et
 * mène à `/chats` ; le fil en temps réel n'est plus la porte d'entrée.
 *
 * `aUneSession` LIT UN COOKIE QUI N'AUTORISE RIEN. `meeshy_session` n'est ni
 * signé ni `HttpOnly` : il choisit quel écran servir, pas ce qu'on a le droit de
 * voir. Ce qui garde la porte est le jeton, opposé à la passerelle par
 * `app/connecte/porte.ts` — un cookie forgé n'obtient donc pas des données, mais
 * un renvoi vers la connexion.
 *
 * LA VITRINE SE REVALIDE ; ELLE NE SE REPAIE PAS.
 *
 * La politique d'origine — `s-maxage=300, stale-while-revalidate=86400` —
 * autorisait un navigateur à RESSERVIR la vitrine pendant 24 h : un lecteur qui
 * vient de se connecter serait retombé sur « Créer un compte ». L'objection
 * était donc la CORRECTION, et elle tient. La réponse qui a suivi — `no-store` —
 * répondait, elle, au COÛT, et à contresens : `no-store` interdit au navigateur
 * de GARDER l'entité, si bien que chaque retour arrière depuis `/login`, chaque
 * seconde visite, chaque reprise après coupure repayait 21 Ko sans validateur,
 * sur l'écran même qui vante sa légèreté en zone rurale (directive du porteur,
 * « cache-first dès qu'un cache existe »).
 *
 * `private, no-cache` répond aux DEUX : le navigateur garde l'entité et
 * REVALIDE à chaque emploi. La requête de revalidation repasse par ce
 * gestionnaire, donc par le cookie — un lecteur devenu connecté prend la
 * branche du tableau de bord AVANT toute comparaison d'étiquette, et ne peut
 * pas recevoir un 304 sur la vitrine. `private` garde les caches partagés hors
 * du chemin, la réponse dépendant d'un lecteur.
 *
 * L'ÉTIQUETTE SE CALCULE UNE FOIS. Le document ne dépend d'aucune donnée : il
 * est le même pour tous les visiteurs, pour toute la vie du processus. Le hacher
 * à chaque requête ferait payer au serveur ce qu'on épargne au réseau.
 */

type VitrineServie = {
  readonly html: string;
  readonly etiquette: string;
};

let memoire: VitrineServie | null = null;

const vitrineServie = (): VitrineServie => {
  if (memoire === null) {
    const html = documentDeLaVitrine();
    memoire = { html, etiquette: `"${createHash('sha256').update(html).digest('hex').slice(0, 32)}"` };
  }
  return memoire;
};

/**
 * `If-None-Match` est une LISTE d'étiquettes, dont chacune peut arriver
 * AFFAIBLIE (`W/"…"`) : un intermédiaire a le droit de le faire, et une
 * comparaison par égalité stricte de l'en-tête entier rendrait alors 200 sur
 * toutes les formes sauf une — une revalidation qui n'économise jamais rien,
 * indiscernable d'un cache qui marche. RFC 9110 § 8.8.3.2 : la comparaison est
 * FAIBLE, donc `W/` se retire des deux côtés avant de comparer.
 */
const sansAffaiblissement = (etiquette: string): string => etiquette.replace(/^W\//, '').trim();

const porteLEtiquette = (entete: string | null, etiquette: string): boolean =>
  entete !== null &&
  entete
    .split(',')
    .map(sansAffaiblissement)
    .includes(sansAffaiblissement(etiquette));

const ENTETES_DE_REVALIDATION = (etiquette: string): Record<string, string> => ({
  'cache-control': 'private, no-cache',
  etag: etiquette,
});

export const GET = async (requete: Request): Promise<Response> => {
  if (aUneSession(requete)) return TABLEAU(requete);

  const { html, etiquette } = vitrineServie();

  if (porteLEtiquette(requete.headers.get('if-none-match'), etiquette)) {
    return new Response(null, { status: 304, headers: ENTETES_DE_REVALIDATION(etiquette) });
  }

  const reponse = rendLePage(html);
  for (const [nom, valeur] of Object.entries(ENTETES_DE_REVALIDATION(etiquette))) {
    reponse.headers.set(nom, valeur);
  }
  return reponse;
};
