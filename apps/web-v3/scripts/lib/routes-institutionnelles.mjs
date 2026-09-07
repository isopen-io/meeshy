/**
 * LES CINQ ADRESSES INSTITUTIONNELLES, déclarées UNE fois.
 *
 * Trois consommateurs les lisent, et c'est la raison d'être de ce fichier :
 *
 *   1. `scripts/prerend-institutionnel.tsx` — qui ÉCRIT les documents ;
 *   2. `vite.config.ts` — qui les EXCLUT du repli de navigation du service
 *      worker (sans quoi la coquille de l'application les masque) ;
 *   3. `scripts/verifie-institutionnel.mjs` — qui VÉRIFIE, sur un navigateur
 *      réel, que chacune est servie depuis le cache et non depuis la coquille.
 *
 * Les trois listes ont divergé une fois : le préchauffage écrivait cinq pages
 * que le service worker ne connaissait pas, et personne ne s'en apercevait
 * parce que chaque moitié était juste de son côté. Une liste écrite deux fois
 * est une liste qui finira par dire deux choses.
 */
export const ROUTES_INSTITUTIONNELLES = ['about', 'contact', 'partners', 'privacy', 'terms'];

/**
 * Les DEUX formes de chaque adresse, parce que les deux sont servies : sans
 * barre finale (`/about`) et avec (`/about/`). Le préchauffage écrit un fichier
 * pour chacune — `about.html` et `about/index.html` — après qu'un `/privacy`
 * sans barre est tombé dans le repli de l'application pendant que `/privacy/`
 * fonctionnait.
 */
export const CHEMINS_INSTITUTIONNELS = ROUTES_INSTITUTIONNELLES.flatMap((r) => [`/${r}`, `/${r}/`]);

/**
 * Le motif que le service worker évalue pour DÉCIDER de ne pas servir la
 * coquille. `navigateFallbackDenylist` prend des expressions régulières ; celle
 * -ci est ancrée aux deux bouts pour qu'une adresse comme `/about-nous`, qui
 * appartient bien à l'application, ne soit pas exclue par erreur.
 */
export const MOTIF_INSTITUTIONNEL = new RegExp(`^/(?:${ROUTES_INSTITUTIONNELLES.join('|')})/?$`);
