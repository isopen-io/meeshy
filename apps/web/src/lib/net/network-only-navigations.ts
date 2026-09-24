/**
 * LES NAVIGATIONS QUE LE SERVICE WORKER LAISSE AU RÉSEAU, parce que nginx les
 * traite lui-même (bascule de meeshy.me, #6702).
 *
 * Sans cette liste, `NavigationRoute` répond à TOUTE navigation par
 * `index.html` — la coquille — sans jamais interroger le serveur. Un visiteur
 * qui porte déjà le service worker de la v2 ne recevrait donc plus les
 * redirections 308 des adresses héritées du legacy (`/join`, `/p/…`, le lien
 * de parrainage `/?affiliate=`), ni les fichiers que nginx sert à la racine.
 * L'échec serait silencieux, et réservé aux lecteurs qui REVIENNENT.
 *
 * MINIMALE, par construction : chaque motif retire une adresse à la coquille
 * hors ligne. N'y entrent que les adresses dont nginx est l'autorité, jamais
 * une route de la v2 — `network-only-navigations.test.ts` confronte la liste à
 * `route-table.tsx`, `/conversations/new` compris. `/chat/` et `/l/` n'y sont
 * PAS : ce seront des routes de la v2.
 *
 * Workbox confronte chaque motif à `pathname + search`
 * (`NavigationRoute._match`, workbox-routing 6.6.0), jamais au seul chemin.
 * D'où la fin de segment `(?:[/?]|$)` plutôt que `$` : `/join?linkId=abc` doit
 * partir au réseau comme `/join`, et `/conversations/new?draft=1` rester à la
 * v2 comme `/conversations/new`. Aucun motif ne porte `g` ni `y` : Workbox
 * rejoue `test` sur la même instance à chaque navigation, et un `lastIndex`
 * qui avance ferait alterner la réponse.
 */
export const NETWORK_ONLY_NAVIGATIONS: readonly RegExp[] = [
  /^\/join(?:[/?]|$)/,
  /^\/conversations\/(?!new(?:[/?]|$))/,
  /^\/conversation\//,
  /^\/p\//,
  /^\/s\//,
  /* `/u/` SE PARTAGE, ET LA COUPE EST MESURABLE (#7083) — nginx y sert les
     médias hérités (`root /srv/legacy-uploads`) ET, par `try_files`, la fiche
     de profil de la v2. Le préfixe entier laissait donc `/u/<pseudo>` au
     réseau : la fiche n'existait pas hors ligne et payait un aller-retour à
     froid. Un PSEUDO ne peut porter ni point ni barre (`usernamePatternSource`,
     `^[a-zA-Z0-9_-]+$`), un ObjectId non plus ; un téléversement porte toujours
     une extension, et peut être imbriqué. Ces deux motifs ne tranchent pas à la
     place de nginx — ils disent seulement QUI doit lui poser la question. Se
     tromper de sens casse chaque avatar hérité, en silence, pour les seuls
     lecteurs qui reviennent : `network-only-navigations.test.ts` énumère les
     deux familles. */
  /^\/u\/[^?#]*\./,
  /^\/u\/[^/?#]+\/[^/?#]/,
  /^\/users\//,
  /^\/\.well-known\//,
  /^\/(?:robots\.txt|sitemap\.xml|manifest\.json|android-chrome-512x512\.png)(?:\?|$)/,
  /* La RACINE parrainée, et elle seule : nginx route sur le chemin, et c'est
     la seule adresse dont la redirection dépend de la requête. */
  /^\/\?(?:[^#]*&)?affiliate=/,
];
