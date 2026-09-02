import type { CibleDuLien } from '@/lib/api/links';

/**
 * Où mène un lien tracé — la seule table qui le dit.
 *
 * Elle est ici, et pas dans `lib/api/links.ts`, parce qu'elle ne parle pas à la
 * passerelle : c'est une projection de SA forme vers les ROUTES de la v3
 * (§ 10.1). Le jour où l'écran `join` en aura besoin, elle remonte dans `lib/` —
 * règle de placement (B) —, pas avant : une seule surface la rend aujourd'hui.
 *
 * Trois décisions y sont gravées, chacune mesurée :
 *
 *   1. **`CONVERSATION` mène à `/chat/<jeton>` — la porte de l'INVITÉ, en UN
 *      saut (directive 2026-09-01, conception § 12.3) —, jamais à
 *      `/conversations/<id>` ni à `/chats/<jeton>`.** `/chats/:cle` est le fil
 *      du MEMBRE : il renvoie un lecteur sans session vers `/login`, ce qui
 *      faisait payer un SECOND saut à tout lien reçu (leçon 419).
 *      `/chat/:lien` répond 200 en état CHOIX à un lecteur sans session.
 *      `TrackingLinkService.resolveTarget` rend le `conversationId`
 *      (`services/gateway/src/services/TrackingLinkService.ts:198`) et la route
 *      qui le sert est fermée aux anonymes : la suivre CASSE le rôle premier.
 *      C'est le régime 4 du § 5.1 — mapping client en attendant l'issue
 *      passerelle `gw:resolveTarget-linkKey`. La clé qui ouvre la place est
 *      donc le JETON du lien, la seule que le lecteur ait en main.
 *   2. **Un lien qu'on ne sait pas ouvrir mène à l'état CLOS, jamais nulle
 *      part.** Un identifiant manquant, un type que la v3 ne rend pas, une URL
 *      externe dont le schéma n'est pas `http(s)` : trois façons pour une
 *      redirection de devenir une page blanche ou, pire, une redirection
 *      OUVERTE. `EXTERNAL` est la seule branche qui quitte l'origine, et elle
 *      ne le fait que sur un schéma nommé — `javascript:`, `data:` et le
 *      protocole-relatif `//hôte` sont refusés, pas assainis.
 *   3. **Tout ce qui vient du réseau est ÉCHAPPÉ avant d'entrer dans un
 *      chemin.** Le jeton comme l'identifiant traversent la passerelle ; les
 *      poser bruts dans une URL, c'est laisser le contenu décider de la route.
 */

const CHEMIN_PAR_TYPE: Readonly<Partial<Record<CibleDuLien['typeDeCible'], string>>> = {
  STORY: '/stories',
  REEL: '/reels',
  POST: '/posts',
  STATUS: '/moods',
  PROFILE: '/u',
};

const SCHEMAS_SERVABLES: readonly string[] = ['http:', 'https:'];

/**
 * La forme d'un jeton, telle que la passerelle la DÉCLARE — le schéma de
 * `GET /tracking-links/:token/resolve` (`^[a-zA-Z0-9_-]{2,50}$`).
 *
 * Elle est ici, avec les autres adresses de `/l/:token`, parce que les DEUX
 * surfaces de cette route s'en servent : la redirection, qui refuse d'appeler
 * pour rien, et l'écran clos, qui refuse de porter jusqu'à la passerelle un
 * segment d'URL que personne n'a validé. L'écrire deux fois serait la jumelle
 * qui dérive au premier caractère admis en plus.
 */
const JETON = /^[a-zA-Z0-9_-]{2,50}$/;

export const estUnJetonServable = (token: string): boolean => JETON.test(token);

/** L'état CLOS d'un lien — expiré, désactivé, inconnu ou inouvrable : une seule adresse pour les quatre. */
export const cheminDuLienClos = (token: string): string => `/l/${encodeURIComponent(token)}/expired`;

const urlExterneServable = (urlOriginale: string | null): string | null => {
  if (urlOriginale === null) return null;
  try {
    return SCHEMAS_SERVABLES.includes(new URL(urlOriginale).protocol) ? urlOriginale : null;
  } catch {
    return null;
  }
};

export const destinationDe = ({
  token,
  cible,
}: {
  readonly token: string;
  readonly cible: CibleDuLien;
}): string => {
  if (cible.typeDeCible === 'CONVERSATION') return `/chat/${encodeURIComponent(token)}`;
  if (cible.typeDeCible === 'EXTERNAL') {
    return urlExterneServable(cible.urlOriginale) ?? cheminDuLienClos(token);
  }

  const racine = CHEMIN_PAR_TYPE[cible.typeDeCible];
  if (racine === undefined || cible.idDeCible === null) return cheminDuLienClos(token);

  return `${racine}/${encodeURIComponent(cible.idDeCible)}`;
};
