import type { IncomingMessage } from 'node:http';

import { serviParLAnnuaire } from './bouchon-annuaire';
import type { Identite } from './bouchon-socket';
import {
  AUTRE_CONVERSATION,
  CONVERSATION_DU_LECTEUR,
  MEMBRE,
  PAIR_ANGLOPHONE,
  PAIR_HISPANOPHONE,
  PRENOM_DU_LECTEUR,
} from './bouchon-monde';

/**
 * LES SEPT ROUTES DE LA ZONE CONNECTÉE (et quatre de plus depuis § 12.10.3,
 * le panneau de profil : `GET /directory/people/:handle?expand=relation`,
 * `POST /conversations`, `POST /directory/friend-requests`,
 * `PUT /directory/blocks/:userId` — chacune ci-dessous, à son tour), copiées
 * sur la passerelle RÉELLE. `GET /api/v1/conversations/search`,
 * `GET /api/v1/directory/people` et `GET /api/v1/attachments/search` — les
 * trois routes de `/search` gardées côté client — vivent désormais dans
 * `bouchon-recherche.ts` (#4170, bande 1000-1200) ; la quatrième
 * (`GET /links?q=`) reste ci-dessous, dans `bouchon-carnet.ts`.
 *
 *   • `GET /api/v1/auth/me` — `services/gateway/src/routes/auth/magic-link.ts:79`,
 *     `createUnifiedAuthMiddleware({ requireAuth: true, allowAnonymous: true })` ;
 *   • `GET /api/v1/conversations` — la liste du lecteur, `{ success, data, pagination }` ;
 *   • `GET /api/v1/links` — `services/gateway/src/routes/links/user.ts:314`,
 *     `authRequired` = `{ requireAuth: true, allowAnonymous: false }`, et
 *     `conversation` servi UNIQUEMENT avec `?expand=conversation` (`:571-581`) ;
 *   • `GET /api/v1/directory/friend-requests` — `routes/directory/friend-requests.ts:222`,
 *     dont les lignes sortent par `demandeAvecPresenceSchema` (`:78`) ;
 *   • `GET /api/v1/directory/contacts` — `routes/directory/contacts.ts:128`,
 *     dont les lignes sortent par `directoryEntrySchema`
 *     (`routes/users/contacts-schemas.ts:24`) ;
 *   • `GET /api/v1/posts/:postId` — `routes/posts/core.ts:460`,
 *     `preValidation: [requiredAuth]` ;
 *   • `GET /api/v1/posts/:postId/comments` — `routes/posts/comments.ts:61`,
 *     même garde, servant `{ success, data, pagination }` SANS schéma de
 *     réponse déclaré — donc sans rien retirer.
 *
 * TROIS DE PLUS DEPUIS #5031 (le fil social, `/feed`) :
 *
 *   • `GET /api/v1/social/posts?scope=home|stories` — `routes/posts/feed.ts:740`,
 *     `scope=home` exige `registeredUserId` (`:789`) ;
 *   • `POST`/`DELETE /api/v1/posts/:postId/like` — `routes/posts/
 *     interactions.ts:79` et `:237` ;
 *   • `POST /api/v1/posts/:postId/repost` — `routes/posts/interactions.ts:790`,
 *     UNE seule forme (repost simple, `isQuote:false`) — aucune route pour le
 *     défaire.
 *
 * LES DEUX DERNIÈRES SERVENT DES TRADUCTIONS EN CARTE D'OBJETS
 * (`{ langue: { text } }`, `schema.prisma:3523`), et c'est ce qui donne sa
 * valeur à l'audit : un client qui passerait cette carte telle quelle au
 * résolveur du Prisme rendrait l'ORIGINAL partout, sans qu'aucune erreur ne le
 * dise. Le bouchon sert donc la forme RÉELLE, jamais une carte de chaînes
 * arrangeante.
 *
 * LES DEUX DERNIÈRES SERVENT LA PRÉSENCE COMME LA LOI L'IMPOSE, et c'est ce que
 * l'écran des contacts doit rendre : une demande EN ATTENTE est masquée — son
 * expéditeur n'est pas encore un ami (directive 2026-08-25), donc
 * `isOnline: false` / `lastActiveAt: null` — pendant qu'un contact ÉTABLI porte
 * sa présence. Un bouchon qui servirait la présence des deux rendrait vert un
 * client qui la fabrique.
 *
 * Le porteur est EXIGÉ et VÉRIFIÉ, comme en production : sans créance, 401
 * `AUTH_REQUIRED` (`middleware/auth.ts:709-714`) ; avec un `Bearer` que la
 * passerelle ne sait pas lire — périmé, forgé —, 401 `AUTH_FAILED`
 * (`:770-775`, « Invalid JWT token »). Un bouchon qui servait ces routes à
 * tout `Bearer` rendait vert un client qui prenait un jeton MORT pour un
 * membre : c'est par `/auth/me` que `/chat/:lien` prouve désormais l'identité
 * AVANT de pousser la porte de jonction.
 */

type Reponse = (corps: unknown, statut?: number) => void;

export type EtatDuCompteDeBouchon = {
  readonly creanceDe: (requete: IncomingMessage) => Identite | null;
  /** Le lecteur connecté n'a NI conversation NI lien — l'état vide du tableau de bord. */
  readonly lecteurSansRien: boolean;
  /**
   * Les préférences du lecteur PAR conversation, écrites par
   * `PUT /user-preferences/conversations/:id` et RELUES par la liste — un état
   * partagé, comme la ligne `UserConversationPreferences` l'est en base. Sans
   * lui, un geste rendait 200 et la ligne suivante servait l'état d'avant.
   */
  readonly preferences: Map<string, { isMuted?: boolean; isArchived?: boolean }>;
  /** Les conversations que le lecteur a masquées pour lui — `delete-for-me`, une porte à SENS UNIQUE. */
  readonly masquees: Set<string>;
  /**
   * LE PROFIL DU LECTEUR, MUTABLE — écrit par `PATCH /users/me` et RELU par
   * `/auth/me`. Sans cet état partagé, « Enregistrer » rendrait 200 et l'écran
   * suivant afficherait la valeur d'avant : le témoin serait vert sur une
   * écriture qui n'écrit rien.
   */
  readonly profil: Record<string, string>;
  /** Les appareils de push, que `DELETE /users/me/devices/:id` retire pour de bon. */
  readonly appareils: { id: string; deviceName: string; platform: string; lastUsedAt: string | null }[];
  /** Les conversations de GROUPE créées pendant la session — relues par la liste. */
  readonly conversationsCreees: { id: string; titre: string }[];
  /**
   * LES CORPS DE `POST /api/v1/posts` REÇUS (#4966) — le critère de fin du
   * composer porte sur ce qui PART, pas sur ce que le document montre : une
   * audience se vérifie sur la charge envoyée, jamais sur le `<select>` rendu.
   */
  readonly publicationsRecues: Record<string, unknown>[];
  /** La boîte de notifications du lecteur — servie par `GET /notifications`, mutée par `read-all`. */
  readonly boite: BoiteDeNotifsDeBouchon;
  /** Le fil de commentaires d'une publication — écrit par le POST, relu par le GET (#5091). */
  readonly filDeCommentaires: FilDeCommentairesDeBouchon;
  /** Le fil social — MUTABLE, pour prouver le rafraîchissement au retour (#5031). */
  readonly filSocial: FilSocialDeBouchon;
};

/**
 * LA BOÎTE DE NOTIFICATIONS DU BOUCHON (#4898) — deux lignes dans la forme de
 * `formatNotification` (l'état sous `state`, le contexte sous `context`), et
 * l'état MUTABLE que `POST /notifications/read-all` écrit, comme la passerelle
 * écrit sa base : un bouchon qui répond 200 sans écrire fait passer un client
 * qui n'a rien changé. `remets()` restaure l'état initial entre deux témoins.
 */
/** Le curseur de la page suivante — le témoin #5087 le demande sans y lire une forme réelle. */
export const CURSEUR_DE_LA_BOITE_SUIVANTE = 'page-2';

export type BoiteDeNotifsDeBouchon = {
  lignes: Record<string, unknown>[];
  nonLues: number;
  /** La page SUIVANTE, ou `null` — la première page ne l'annonce que si elle existe (#5087). */
  pageSuivante: Record<string, unknown>[] | null;
  readonly litTout: () => void;
  readonly remets: () => void;
};

export const boiteDeNotifsDeBouchon = (conversationId: string): BoiteDeNotifsDeBouchon => {
  const initiales = (): Record<string, unknown>[] => [
    {
      id: 'notif-1',
      userId: MEMBRE.id,
      type: 'message',
      title: 'Ibrahim vous a répondu',
      subtitle: null,
      content: 'On se cale à 15 h ?',
      actor: { id: 'u-ibrahim', displayName: 'Ibrahim' },
      context: { conversationId },
      state: { isRead: false, readAt: null, createdAt: ilYA(0.1) },
    },
    {
      id: 'notif-2',
      userId: MEMBRE.id,
      type: 'contact_accepted',
      title: 'Sara Kim a accepté votre demande',
      subtitle: null,
      content: null,
      actor: { id: 'u-sara', displayName: 'Sara Kim' },
      context: {},
      state: { isRead: true, readAt: ilYA(1), createdAt: ilYA(1) },
    },
  ];
  const boite: BoiteDeNotifsDeBouchon = {
    lignes: initiales(),
    nonLues: 1,
    pageSuivante: null,
    litTout: () => {
      boite.lignes = boite.lignes.map((ligne) => ({
        ...ligne,
        state: { ...(ligne.state as Record<string, unknown>), isRead: true, readAt: new Date().toISOString() },
      }));
      boite.nonLues = 0;
    },
    remets: () => {
      boite.lignes = initiales();
      boite.nonLues = 1;
      boite.pageSuivante = null;
    },
  };
  return boite;
};

/** Une partie de demande — `demandeAvecPresenceSchema`, présence MASQUÉE par la loi. */
const partieMasquee = (id: string, pseudonyme: string, nom: string) => ({
  id,
  username: pseudonyme,
  displayName: nom,
  avatar: null,
  firstName: null,
  lastName: null,
  isOnline: false,
  lastActiveAt: null,
});

const ilYA = (jours: number): string => new Date(Date.now() - jours * 24 * 3_600_000).toISOString();

const DEMANDES_EN_ATTENTE = [
  {
    id: 'fr-sara',
    senderId: 'u-sara',
    receiverId: MEMBRE.id,
    message: null,
    status: 'pending',
    respondedAt: null,
    createdAt: ilYA(2),
    updatedAt: ilYA(2),
    sender: partieMasquee('u-sara', 'sarakim', 'Sara Kim'),
    receiver: partieMasquee(MEMBRE.id, 'amina', MEMBRE.nom),
  },
  {
    id: 'fr-kofi',
    senderId: MEMBRE.id,
    receiverId: 'u-kofi',
    message: null,
    status: 'pending',
    respondedAt: null,
    createdAt: ilYA(3),
    updatedAt: ilYA(3),
    sender: partieMasquee(MEMBRE.id, 'amina', MEMBRE.nom),
    receiver: partieMasquee('u-kofi', 'kofiowusu', 'Kofi Owusu'),
  },
];

/** Une ligne de carnet — `directoryEntrySchema`, présence SERVIE (contact établi). */
const CARNET = [
  {
    id: 'uc-marta',
    contactKey: 'phone:+34600000000',
    displayName: 'Marta Ruiz',
    phoneNumbers: ['+34600000000'],
    emails: [],
    usernames: [],
    isOnMeeshy: true,
    matchedBy: 'phone',
    matchedAt: ilYA(30),
    lastSyncedAt: ilYA(1),
    matchedUser: {
      id: 'u-marta',
      username: 'marta',
      firstName: null,
      lastName: null,
      displayName: 'Marta Ruiz',
      avatar: null,
      isOnline: true,
      lastActiveAt: new Date().toISOString(),
    },
  },
];

/** Une carte de traductions à la forme de Prisma — des OBJETS, jamais des chaînes. */
const traduit = (paires: Readonly<Record<string, string>>) =>
  Object.fromEntries(
    Object.entries(paires).map(([code, text]) => [
      code,
      { text, translationModel: 'nllb-200', confidenceScore: 0.94 },
    ]),
  );

/**
 * LA PUBLICATION COMMENTÉE. Écrite en ANGLAIS et traduite en français : le
 * lecteur du bouchon préfère le français, donc l'écran doit servir la
 * traduction ET annoncer « traduit de l'anglais ».
 */
const PUBLICATION_DU_BOUCHON = {
  id: 'p-revue',
  type: 'POST',
  title: 'Revue de mars',
  content: 'The March review is ready. Three charts, two surprises.',
  originalLanguage: 'en',
  translations: traduit({ fr: 'La revue de mars est prête. Trois graphiques, deux surprises.' }),
  createdAt: new Date(Date.now() - 4 * 3_600_000).toISOString(),
  author: { id: 'u-ibrahim', username: 'ibrahim', displayName: 'Ibrahim' },
};

/**
 * TROIS COMMENTAIRES, ET CHACUN COUVRE UN CAS QUE L'AUDIT DOIT VOIR :
 *
 *   1. traduit à un rang INFÉRIEUR (rang 1 absent) — la ligne du Prisme ;
 *   2. écrit dans la langue du lecteur — AUCUNE ligne de Prisme, aucun `lang=` ;
 *   3. le MIEN — « Modifier · Supprimer », que les deux autres n'ont pas.
 *
 * Sans les trois, `color-contrast` ne verrait ni la ligne du Prisme ni les
 * gestes d'auteur, et l'audit serait vert par vacuité sur la moitié de l'écran.
 */
/**
 * LE FIL DE COMMENTAIRES, MUTABLE (#5091) — écrit par `POST /posts/:id/comments`
 * et RELU par le GET : un bouchon qui répond 200 sans écrire fait passer un
 * client qui n'a rien changé. `remets()` restaure l'état initial entre témoins.
 */
export type FilDeCommentairesDeBouchon = {
  lignes: Record<string, unknown>[];
  readonly ajoute: (contenu: string) => Record<string, unknown>;
  readonly remets: () => void;
};

export const filDeCommentairesDeBouchon = (): FilDeCommentairesDeBouchon => {
  const initiales = (): Record<string, unknown>[] => COMMENTAIRES_DU_BOUCHON.map((k) => ({ ...k }));
  let suivant = 0;
  const fil: FilDeCommentairesDeBouchon = {
    lignes: initiales(),
    ajoute: (contenu) => {
      suivant += 1;
      const ligne = {
        id: `k-neuf-${suivant}`,
        content: contenu,
        originalLanguage: 'fr',
        translations: {},
        likeCount: 0,
        replyCount: 0,
        createdAt: new Date().toISOString(),
        author: { id: MEMBRE.id, username: 'amina', displayName: MEMBRE.nom },
      };
      fil.lignes = [...fil.lignes, ligne];
      return ligne;
    },
    remets: () => {
      fil.lignes = initiales();
      suivant = 0;
    },
  };
  return fil;
};

const COMMENTAIRES_DU_BOUCHON = [
  {
    id: 'k-marta',
    content: 'Are the Q1 numbers up to date?',
    originalLanguage: 'en',
    translations: traduit({ es: '¿Están actualizadas las cifras del Q1?' }),
    likeCount: 4,
    replyCount: 0,
    createdAt: new Date(Date.now() - 2 * 3_600_000).toISOString(),
    author: { id: 'u-marta', username: 'marta', displayName: 'Marta Ruiz' },
  },
  {
    id: 'k-ibrahim',
    content: 'Oui, poussés ce matin.',
    originalLanguage: 'fr',
    translations: {},
    likeCount: 2,
    replyCount: 0,
    createdAt: new Date(Date.now() - 3_600_000).toISOString(),
    author: { id: 'u-ibrahim', username: 'ibrahim', displayName: 'Ibrahim' },
  },
  {
    id: 'k-moi',
    content: 'Je relis avant ce soir.',
    originalLanguage: 'fr',
    translations: {},
    likeCount: 1,
    replyCount: 0,
    createdAt: new Date(Date.now() - 12 * 60_000).toISOString(),
    author: { id: MEMBRE.id, username: 'amina', displayName: MEMBRE.nom },
  },
];

/**
 * LE FIL SOCIAL (`/feed`, #5031) — `GET /api/v1/social/posts?scope=home`
 * (`routes/posts/feed.ts:740`, `optionalAuth` puis `registeredUserId` requis
 * sur `scope=home`). LE PREMIER POST EST LA MÊME PUBLICATION que
 * `PUBLICATION_DU_BOUCHON` (« Revue de mars », Ibrahim) — l'écran des
 * commentaires ET le fil montrent la MÊME publication dans la cible
 * (`cible/comments.png`, `cible/feed.png`), et lui donner deux textes
 * différents ferait deux vérités sur un seul post. Seuls les compteurs
 * sociaux (`likeCount`, `commentCount`, `repostCount`) et le média
 * s'ajoutent — `PostFeedService.getFeed` les sert, la route commentée ne les
 * déclare pas.
 */
const FIL_SOCIAL_DU_BOUCHON = [
  {
    ...PUBLICATION_DU_BOUCHON,
    likeCount: 128,
    commentCount: 12,
    repostCount: 4,
    isLikedByMe: false,
    isRepostedByMe: false,
    media: [],
  },
  {
    id: 'p-glossaire',
    type: 'REEL',
    content: 'Nuevo glosario compartido para el equipo.',
    originalLanguage: 'es',
    translations: {},
    createdAt: new Date(Date.now() - 20 * 3_600_000).toISOString(),
    author: { id: PAIR_HISPANOPHONE.id, username: 'marta', displayName: PAIR_HISPANOPHONE.nom },
    likeCount: 9,
    commentCount: 0,
    repostCount: 0,
    isLikedByMe: true,
    isRepostedByMe: false,
    media: [{ fileUrl: 'https://cdn.meeshy.test/reel-glossaire.jpg', mimeType: 'image/jpeg', width: 800, height: 600 }],
  },
];

/**
 * LE FIL DE RÉELS CONNECTÉ (`/feed/reels`, #5032) — `scope=reels`.
 *
 * DEUX RÉELS, ET C'EST LE MINIMUM QUI PROUVE QUELQUE CHOSE. Avec un seul, le
 * tap « Réel suivant » ne se rendrait jamais et le témoin sortirait vert sans
 * avoir jamais parcouru : c'est le PAS du fil qui est le sujet, pas l'affichage
 * d'un réel — celui-là, `/reels/:id` le garde déjà.
 *
 * ILS PORTENT LA MÊME FORME QUE `GET /posts/:id`, et ce n'est pas une
 * commodité de bouchon : `feedPostInclude = postInclude`
 * (`PostFeedService.ts:36`), donc la passerelle sert bien ici la ligne
 * ENTIÈRE — `translations`, `originalLanguage`, `media`, `isLikedByMe`. C'est
 * exactement ce qui permet au lecteur unique de la lire sans un aller-retour
 * de plus, et un bouchon qui servirait une projection maigre ferait passer un
 * client que la vraie passerelle nourrit autrement.
 *
 * LE PREMIER EST ESPAGNOL AVEC SA TRADUCTION FRANÇAISE : le Prisme de la
 * lectrice doit servir « Le glossaire… » et ANNONCER « traduit de l'espagnol ».
 * Un réel déjà français ne distinguerait pas un lecteur qui descend le Prisme
 * d'un lecteur qui rend l'original.
 */
const REELS_DU_BOUCHON = [
  {
    id: 'reel-glossaire',
    type: 'REEL',
    content: 'Nuevo glosario compartido para el equipo.',
    originalLanguage: 'es',
    translations: { fr: { text: 'Le nouveau glossaire partagé pour l’équipe.' } },
    createdAt: new Date(Date.now() - 20 * 3_600_000).toISOString(),
    authorId: PAIR_HISPANOPHONE.id,
    author: { id: PAIR_HISPANOPHONE.id, username: 'marta', displayName: PAIR_HISPANOPHONE.nom },
    likeCount: 9,
    commentCount: 0,
    repostCount: 0,
    isLikedByMe: false,
    isRepostedByMe: false,
    media: [{ fileUrl: 'https://cdn.meeshy.test/reel-glossaire.mp4', mimeType: 'video/mp4', width: 720, height: 1280 }],
  },
  {
    id: 'reel-coulisses',
    type: 'REEL',
    content: 'Les coulisses de la revue de mars.',
    originalLanguage: 'fr',
    translations: {},
    createdAt: new Date(Date.now() - 30 * 3_600_000).toISOString(),
    authorId: PAIR_ANGLOPHONE.id,
    author: { id: PAIR_ANGLOPHONE.id, username: 'ibrahim', displayName: PAIR_ANGLOPHONE.nom },
    likeCount: 1200,
    commentCount: 84,
    repostCount: 12,
    isLikedByMe: true,
    isRepostedByMe: false,
    media: [{ fileUrl: 'https://cdn.meeshy.test/reel-coulisses.mp4', mimeType: 'video/mp4', width: 720, height: 1280 }],
  },
];

/** Le curseur du bouchon : l'INDEX du prochain réel, comme la passerelle rend une borne opaque. */
/**
 * LE FIL SOCIAL, MUTABLE (#5031) — pour prouver le RAFRAÎCHISSEMENT AU RETOUR.
 *
 * Un témoin qui rechargerait un fil INCHANGÉ ne dirait rien : il passerait
 * aussi bien avec un module qui ne rafraîchit pas. La publication neuve est
 * donc posée ENTRE les deux lectures, comme un ami la posterait pendant qu'on
 * regarde ailleurs — et c'est elle, présente ou absente à l'écran, qui rend le
 * verdict.
 *
 * `remets()` restaure l'état initial entre témoins.
 */
export type FilSocialDeBouchon = {
  posts: Record<string, unknown>[];
  /** Publie une ligne EN TÊTE, comme le fil la sert (le plus récent d'abord). */
  readonly publie: (texte: string) => Record<string, unknown>;
  readonly remets: () => void;
};

export const filSocialDeBouchon = (): FilSocialDeBouchon => {
  const initiaux = (): Record<string, unknown>[] => FIL_SOCIAL_DU_BOUCHON.map((post) => ({ ...post }));
  let suivant = 0;
  const fil: FilSocialDeBouchon = {
    posts: initiaux(),
    publie: (texte) => {
      suivant += 1;
      const post = {
        ...FIL_SOCIAL_DU_BOUCHON[0],
        id: `p-neuve-${suivant}`,
        content: texte,
        translations: {},
        createdAt: new Date().toISOString(),
        likeCount: 0,
        commentCount: 0,
        repostCount: 0,
        isLiked: false,
        isReposted: false,
        media: [],
      };
      fil.posts = [post, ...fil.posts];
      return post;
    },
    remets: () => {
      fil.posts = initiaux();
      suivant = 0;
    },
  };
  return fil;
};

export const CURSEUR_DU_SECOND_REEL = 'apres-reel-glossaire';

/**
 * LE RAIL DE STORIES — `scope=stories&projection=tray`, projeté à un nom, un
 * auteur, et l'état vu/non-vu (`isViewedByMe`, servi dans les DEUX
 * projections — `PostFeedService.fetchAndEnrichStories`). Les QUATRE de la
 * cible (`cible/feed.png` : IB, MR, SK, LM) — les trois premiers réemploient
 * des identités déjà nommées ailleurs dans ce bouchon (`PAIR_ANGLOPHONE`,
 * `PAIR_HISPANOPHONE`, la Sara Kim des demandes d'ami) ; seule « Luc Martin »
 * n'a aucun autre lecteur dans le dépôt. `isViewedByMe` REPREND exactement la
 * cible : Ibrahim et Marta portent l'anneau ACCENTUÉ (non vues), Sara et Luc
 * l'anneau NEUTRE (déjà vues) — sans les DEUX familles, un rail où tout se
 * ressemble repasserait inaperçu.
 */
const RAIL_DU_BOUCHON = [
  { id: 'story-ibrahim', authorId: PAIR_ANGLOPHONE.id, author: { id: PAIR_ANGLOPHONE.id, displayName: PAIR_ANGLOPHONE.nom }, isViewedByMe: false },
  { id: 'story-marta', authorId: PAIR_HISPANOPHONE.id, author: { id: PAIR_HISPANOPHONE.id, displayName: PAIR_HISPANOPHONE.nom }, isViewedByMe: false },
  { id: 'story-sara', authorId: 'u-sara', author: { id: 'u-sara', displayName: 'Sara Kim' }, isViewedByMe: true },
  { id: 'story-luc', authorId: 'u-luc', author: { id: 'u-luc', displayName: 'Luc Martin' }, isViewedByMe: true },
];

/** Les HUIT champs de `updateUserProfileSchema` — recopiés du schéma, pas devinés. */
const CHAMPS_ACCEPTES: readonly string[] = [
  'firstName',
  'lastName',
  'displayName',
  'bio',
  'systemLanguage',
  'regionalLanguage',
  'customDestinationLanguage',
  'autoTranslateEnabled',
];

export const MOT_DE_PASSE_DU_BOUCHON = 'mot-de-passe-actuel';

export const APPAREILS_DU_BOUCHON = [
  { id: 'd1', deviceName: 'iPhone d’Amina', platform: 'ios', lastUsedAt: null },
  { id: 'd2', deviceName: 'Chrome — Dakar', platform: 'web', lastUsedAt: null },
];

export const routesDuCompte =
  (etat: EtatDuCompteDeBouchon) =>
  ({ requete, url, corps, json }: { readonly requete: IncomingMessage; readonly url: URL; readonly corps: Buffer; readonly json: Reponse }): boolean => {
    const chemin = url.pathname;
    const estUnePreference = chemin.startsWith('/api/v1/user-preferences/conversations/');
    if (
      !(
        chemin.startsWith('/api/v1/auth/me') ||
        chemin.startsWith('/api/v1/auth/logout') ||
        chemin.startsWith('/api/v1/conversations') ||
        chemin.startsWith('/api/v1/directory/') ||
        // LA CRÉATION EST `/api/v1/posts` NU — sans barre finale, donc invisible
        // du `startsWith('/api/v1/posts/')` ci-dessous. Le bouchon rendait 404
        // et le composer restait sur son formulaire : mesuré au navigateur, le
        // 2026-09-04. Une liste d'admission qui n'admet QUE des sous-chemins
        // ferme la racine sans le dire.
        chemin === '/api/v1/posts' ||
        chemin.startsWith('/api/v1/posts/') ||
        chemin.startsWith('/api/v1/social/') ||
        chemin.startsWith('/api/v1/users/me') ||
        chemin.startsWith('/api/v1/notifications') ||
        estUnePreference
      )
    ) {
      return false;
    }

    /**
     * `GET /api/v1/directory/people/:handle?expand=relation`
     * (`routes/directory/person.ts:175`, `onRequest: [getOptionalAuth]`) —
     * AVANT la garde d'authentification ci-dessous : un invité SANS jeton y a
     * droit (relation `'none'`), exactement comme un lecteur anonyme
     * (§ 12.10.3 point 4). C'est ce que le PLUS PRÉCIS avant le PLUS GÉNÉRAL
     * demande : `/directory/people/<handle>` avant `/directory/people` (la
     * recherche, query-only), qui elle reste gardée plus bas. Les fiches et la
     * RELATION vivent dans `bouchon-annuaire.ts` (#5030).
     */
    if (serviParLAnnuaire({ chemin, requete, creanceDe: etat.creanceDe, json })) return true;

    const porteur = requete.headers.authorization ?? '';
    if (!porteur.startsWith('Bearer ')) {
      json({ error: 'Authentication required', code: 'AUTH_REQUIRED' }, 401);
      return true;
    }
    if (etat.creanceDe(requete)?.genre !== 'membre') {
      json({ error: 'Invalid JWT token', code: 'AUTH_FAILED' }, 401);
      return true;
    }
    /**
     * `POST /api/v1/auth/logout` (`services/gateway/src/routes/auth/login.ts:350`,
     * `preValidation: [fastify.authenticate]`) — la déconnexion (#5095). La
     * garde d'authentification ci-dessus copie déjà `fastify.authenticate` ;
     * ce bloc copie la réponse, `{ success: true, data: { message } }`
     * (`login.ts:427`) — le corps exact que `app/deconnexion/route.ts`
     * n'inspecte jamais (l'appel est BEST-EFFORT), mais que le bouchon doit
     * MIMER, pas inventer.
     */
    if (chemin === '/api/v1/auth/logout' && requete.method === 'POST') {
      json({ success: true, data: { message: 'Déconnexion réussie' } });
      return true;
    }
    /**
     * `GET /api/v1/notifications` (`routes/notifications.ts:69`) — la boîte,
     * dans l'enveloppe RÉELLE : `data` + `unreadCount` à la RACINE + la
     * pagination. `POST …/read-all` (`:401`) ÉCRIT l'état partagé et rend le
     * compte marqué, comme là-bas.
     */
    if (chemin === '/api/v1/notifications/read-all' && requete.method === 'POST') {
      const compte = etat.boite.nonLues;
      etat.boite.litTout();
      json({ success: true, data: { count: compte } });
      return true;
    }
    if (chemin === '/api/v1/notifications' && (requete.method ?? 'GET') === 'GET') {
      // Même patron que `/api/v1/social/posts` (`CURSEUR_DU_SECOND_REEL`) : un
      // curseur SENTINELLE, jamais une forme opaque réelle — le bouchon n'a
      // qu'une page à offrir derrière lui (#5087).
      const auCurseur = url.searchParams.get('cursor') === CURSEUR_DE_LA_BOITE_SUIVANTE;
      if (auCurseur && etat.boite.pageSuivante !== null) {
        json({
          success: true,
          data: etat.boite.pageSuivante,
          pagination: { total: etat.boite.lignes.length + etat.boite.pageSuivante.length, hasMore: false, nextCursor: null },
          unreadCount: etat.boite.nonLues,
        });
        return true;
      }
      json({
        success: true,
        data: etat.boite.lignes,
        pagination: {
          total: etat.boite.lignes.length + (etat.boite.pageSuivante?.length ?? 0),
          hasMore: etat.boite.pageSuivante !== null,
          nextCursor: etat.boite.pageSuivante !== null ? CURSEUR_DE_LA_BOITE_SUIVANTE : null,
        },
        unreadCount: etat.boite.nonLues,
      });
      return true;
    }

    /**
     * `PATCH /api/v1/users/me` (`routes/users/profile-updates.ts:41`) — les
     * HUIT champs acceptés, et pas un de plus. Le bouchon REFUSE tout autre
     * champ plutôt que de l'ignorer : c'est la seule façon qu'un témoin rougisse
     * le jour où la v3 enverrait `email`, que la passerelle exclut (#4184).
     */
    if (chemin === '/api/v1/users/me' && requete.method === 'PATCH') {
      const soumis = JSON.parse(corps.toString('utf8') || '{}') as Record<string, unknown>;
      const inconnus = Object.keys(soumis).filter((champ) => !CHAMPS_ACCEPTES.includes(champ));
      if (inconnus.length > 0) {
        json({ success: false, error: { message: `Unsupported field: ${inconnus.join(', ')}` } }, 400);
        return true;
      }
      Object.entries(soumis).forEach(([champ, valeur]) => {
        etat.profil[champ] = typeof valeur === 'string' ? valeur : String(valeur);
      });
      json({ success: true, data: { user: { id: MEMBRE.id, ...etat.profil } } });
      return true;
    }

    /** `PATCH /api/v1/users/me/password` (`routes/users/profile-credentials.ts:32`). */
    if (chemin === '/api/v1/users/me/password' && requete.method === 'PATCH') {
      const soumis = JSON.parse(corps.toString('utf8') || '{}') as Record<string, unknown>;
      if (soumis.currentPassword !== MOT_DE_PASSE_DU_BOUCHON) {
        json({ success: false, error: { message: 'Current password is incorrect' } }, 400);
        return true;
      }
      json({ success: true });
      return true;
    }

    /** `GET`/`DELETE /api/v1/users/me/devices` (`routes/push-tokens.ts:355` et `:427`). */
    const appareilRetire = /^\/api\/v1\/users\/me\/devices\/([^/]+)$/.exec(chemin)?.[1];
    if (appareilRetire !== undefined && requete.method === 'DELETE') {
      const rang = etat.appareils.findIndex(({ id }) => id === decodeURIComponent(appareilRetire));
      if (rang === -1) {
        json({ success: false, error: { message: 'Device not found' } }, 404);
        return true;
      }
      etat.appareils.splice(rang, 1);
      json({ success: true });
      return true;
    }
    if (chemin === '/api/v1/users/me/devices') {
      json({ success: true, data: etat.appareils });
      return true;
    }

    if (chemin.startsWith('/api/v1/auth/me')) {
      json({
        success: true,
        data: {
          id: MEMBRE.id,
          username: 'amina',
          firstName: PRENOM_DU_LECTEUR,
          displayName: MEMBRE.nom,
          // DEUX LANGUES, ET C'EST LE SECOND RANG QUI COMPTE. Avec un prisme
          // d'une seule langue, le court-circuit interdit (« la langue
          // d'origine appartient au prisme ⇒ afficher l'original ») et la
          // règle juste rendent le MÊME verdict : aucun témoin ne peut tomber
          // au rang 1 (leçon 261). Le rang 2 est le seul qui les sépare, donc
          // le lecteur du bouchon en a un.
          systemLanguage: 'fr',
          regionalLanguage: 'es',
          lastName: 'Diallo',
          bio: 'Je lis en français, j’écris en wolof.',
          email: 'amina@meeshy.me',
          phoneNumber: null,
          // CE QUE `PATCH /users/me` A ÉCRIT L'EMPORTE : `/auth/me` relit l'état
          // du bouchon, sans quoi une écriture réussie resterait invisible.
          ...etat.profil,
        },
      });
      return true;
    }

    /**
     * `GET /api/v1/social/posts?scope=home|stories` (`routes/posts/feed.ts:740`)
     * — le fil social et son rail (#5031). `scope=home` exige un compte, comme
     * les neuf autres scopes hors `author`/`community` : la garde est déjà
     * passée plus haut (`creanceDe`), donc ce bouchon ne la rejoue pas.
     */
    /**
     * PUBLIER — `POST /api/v1/posts` (`routes/posts/core.ts:365`,
     * `requiredAuth`). Le bouchon RETIENT le corps reçu : le critère de fin du
     * composer (#4966) porte sur ce qui PART — l'audience choisie, l'emoji
     * d'une humeur, la langue revendiquée —, jamais sur ce que le document
     * affiche. Un bouchon qui répondrait 201 sans regarder ferait passer un
     * client qui n'envoie rien.
     */
    if (chemin === '/api/v1/posts' && requete.method === 'POST') {
      etat.publicationsRecues.push(
        ((): Record<string, unknown> => {
          try {
            return JSON.parse(corps.toString('utf8')) as Record<string, unknown>;
          } catch {
            return {};
          }
        })(),
      );
      json({ success: true, data: { id: 'p-neuf' } }, 201);
      return true;
    }

    if (chemin.startsWith('/api/v1/social/posts')) {
      const scope = url.searchParams.get('scope');
      if (scope === 'stories') {
        json({ success: true, data: RAIL_DU_BOUCHON, pagination: { limit: 50, hasMore: false, nextCursor: null } });
        return true;
      }
      /**
       * `scope=reels` (#5032) — le PAS du fil, servi comme la passerelle le
       * sert : `limit=1`, et un `nextCursor` qui désigne le suivant. Le
       * bouchon PAGINE réellement plutôt que de rendre les deux réels d'un
       * bloc — sinon le témoin du parcours vérifierait un lien que rien
       * n'aurait calculé.
       */
      if (scope === 'reels') {
        const rang = url.searchParams.get('cursor') === CURSEUR_DU_SECOND_REEL ? 1 : 0;
        const reel = REELS_DU_BOUCHON[rang];
        const encore = rang === 0;
        json({
          success: true,
          data: reel === undefined ? [] : [reel],
          pagination: { limit: 1, hasMore: encore, nextCursor: encore ? CURSEUR_DU_SECOND_REEL : null },
        });
        return true;
      }
      json({ success: true, data: etat.filSocial.posts, pagination: { limit: 20, hasMore: false, nextCursor: null } });
      return true;
    }

    /**
     * AIMER — `POST` pose, `DELETE` retire (`routes/posts/interactions.ts:79`
     * et `:237`). Le bouchon n'a pas d'état de like à tenir : le module de
     * participation peint OPTIMISTEMENT avant d'appeler cette route, et un
     * rechargement (chemin SANS JavaScript) relit `isLikedByMe` depuis
     * `FIL_SOCIAL_DU_BOUCHON`, fixe pour la durée d'un spec.
     */
    if (/^\/api\/v1\/posts\/[^/]+\/like$/.test(chemin) && (requete.method === 'POST' || requete.method === 'DELETE')) {
      json({ success: true, data: { liked: requete.method === 'POST' } });
      return true;
    }

    /** REPOSTER — `POST /posts/:postId/repost`, une SEULE forme (repost simple). */
    if (/^\/api\/v1\/posts\/[^/]+\/repost$/.test(chemin) && requete.method === 'POST') {
      json({ success: true, data: { id: `repost-${Date.now()}`, isQuote: false } });
      return true;
    }

    // Le FIL d'une publication, avant la publication elle-même : Fastify
    // distingue ces deux routes par leur chemin complet, et un bouchon qui
    // teste des préfixes ordonne du plus PRÉCIS au plus général.
    if (/^\/api\/v1\/posts\/[^/]+\/comments/.test(chemin)) {
      if (requete.method === 'POST') {
        // `CreateCommentSchema` : `content` ≤ 2000. Le magasin ÉCRIT, comme la
        // base — la re-serve suivante porte le commentaire neuf.
        const poste = JSON.parse(corps.toString('utf8') || '{}') as { content?: string };
        const contenu = (poste.content ?? '').toString();
        if (contenu.length > 2000) {
          json({ success: false, error: { message: 'content too long' } }, 400);
          return true;
        }
        json({ success: true, data: etat.filDeCommentaires.ajoute(contenu) }, 201);
        return true;
      }
      json({
        success: true,
        data: etat.filDeCommentaires.lignes,
        pagination: { limit: 30, hasMore: false, nextCursor: null },
        meta: { mentionedUsers: [] },
      });
      return true;
    }

    if (/^\/api\/v1\/posts\/[^/]+$/.test(chemin)) {
      json({ success: true, data: PUBLICATION_DU_BOUCHON });
      return true;
    }

    if (chemin.startsWith('/api/v1/directory/friend-requests/')) {
      // RÉPONDRE à une demande — `PATCH /directory/friend-requests/:id`
      // (`routes/directory/friend-requests.ts:359`), qui rend la demande sous
      // `demandeAvecConversationSchema`. Le bouchon ne rejoue pas la machine
      // d'états ; il atteste que le client a posté le bon verbe à la bonne
      // adresse, ce que le journal de la passerelle porte.
      json({ success: true, data: { id: chemin.split('/').pop(), status: 'accepted' } });
      return true;
    }

    /**
     * `POST /api/v1/directory/friend-requests` (`friend-requests.ts:289`) —
     * l'action « Ajouter en ami » du panneau de profil (§ 12.10.3 point 5).
     * AVANT le `GET` générique ci-dessous : même chemin, méthode distincte.
     */
    if (chemin === '/api/v1/directory/friend-requests' && requete.method === 'POST') {
      const corpsPoste = ((): Record<string, unknown> => {
        try {
          return JSON.parse(corps.toString('utf8')) as Record<string, unknown>;
        } catch {
          return {};
        }
      })();
      json(
        {
          success: true,
          data: {
            id: 'fr-neuve',
            senderId: MEMBRE.id,
            receiverId: corpsPoste.receiverId ?? null,
            status: 'pending',
            createdAt: new Date().toISOString(),
          },
        },
        201,
      );
      return true;
    }

    /**
     * `PUT /api/v1/directory/blocks/:userId` (`blocks.ts:301`) — l'action
     * « Bloquer » du panneau de profil, idempotente.
     */
    if (chemin.startsWith('/api/v1/directory/blocks/') && requete.method === 'PUT') {
      json({ success: true, data: { message: 'User blocked', blocked: true } });
      return true;
    }

    if (chemin.startsWith('/api/v1/directory/friend-requests')) {
      json({
        success: true,
        data: etat.lecteurSansRien ? [] : DEMANDES_EN_ATTENTE,
        pagination: { hasMore: false, nextCursor: null, limit: 40 },
      });
      return true;
    }

    if (chemin.startsWith('/api/v1/directory/contacts')) {
      json({
        success: true,
        data: etat.lecteurSansRien ? [] : CARNET,
        pagination: { hasMore: false, nextCursor: null, limit: 40 },
      });
      return true;
    }

    /**
     * `PUT /api/v1/user-preferences/conversations/:id` —
     * `services/gateway/src/routes/conversation-preferences.ts:407`,
     * `preValidation: [fastify.authenticate]` (un PORTEUR, jamais une session
     * invitée). Mise à jour PARTIELLE : `:452-455` ne retient que les champs
     * fournis. La réponse est `{ success, data: conversationPreferencesSchema }`.
     */
    if (estUnePreference) {
      if (requete.method !== 'PUT') {
        json({ success: false, error: 'NOT_FOUND', message: 'Not found' }, 404);
        return true;
      }
      const conversationId = chemin.slice('/api/v1/user-preferences/conversations/'.length);
      const champs = ((): Record<string, unknown> => {
        try {
          return JSON.parse(corps.toString('utf8')) as Record<string, unknown>;
        } catch {
          return {};
        }
      })();
      const avant = etat.preferences.get(conversationId) ?? {};
      const apres = {
        ...avant,
        ...(typeof champs.isMuted === 'boolean' ? { isMuted: champs.isMuted } : {}),
        ...(typeof champs.isArchived === 'boolean' ? { isArchived: champs.isArchived } : {}),
      };
      etat.preferences.set(conversationId, apres);
      json({ success: true, data: { conversationId, ...apres } });
      return true;
    }

    /**
     * `POST /api/v1/conversations` (`type:'direct'`,
     * `routes/conversations/core-lifecycle.ts:73`) — l'action « Écrire » du
     * panneau de profil (§ 12.10.3 point 5). AVANT le `GET` générique
     * ci-dessous : même préfixe, méthode distincte.
     */
    /**
     * `POST /api/v1/conversations` (`routes/conversations/core-lifecycle.ts:73`).
     *
     * DEUX APPELANTS, DEUX TYPES, DEUX IDENTIFIANTS. Le panneau de profil crée
     * un TÊTE-À-TÊTE (§ 12.10.3) ; la feuille « nouvelle conversation »
     * (#5072) crée un GROUPE. Rendre le même identifiant pour les deux ferait
     * passer un témoin qui vérifierait la mauvaise destination.
     *
     * Le bouchon REFUSE qu'on s'inclue dans `participantIds` — la passerelle le
     * refuse (« Vous ne devez pas vous inclure dans la liste des
     * participants »), et un bouchon plus permissif que la passerelle laisse
     * passer ce que la production rejettera.
     */
    if (chemin === '/api/v1/conversations' && requete.method === 'POST') {
      const soumis = JSON.parse(corps.toString('utf8') || '{}') as Record<string, unknown>;
      const invites = Array.isArray(soumis.participantIds) ? soumis.participantIds : [];
      if (invites.includes(MEMBRE.id)) {
        json(
          { success: false, error: { message: 'Vous ne devez pas vous inclure dans la liste des participants' } },
          400,
        );
        return true;
      }
      if (soumis.type === 'group') {
        etat.conversationsCreees.push({ id: 'c-neuve-groupe', titre: String(soumis.title ?? '') });
        json({ success: true, data: { id: 'c-neuve-groupe', type: 'group', title: soumis.title } });
        return true;
      }
      json({ success: true, data: { id: 'c-neuve-marta', type: 'direct' } });
      return true;
    }

    /**
     * `DELETE /api/v1/conversations/:id/delete-for-me` —
     * `routes/conversations/delete-for-me.ts:253`, `preValidation:
     * [requiredAuth]`. « Permanently hide a conversation for the calling user » :
     * une porte à SENS UNIQUE, ce qui décide de la fenêtre de réversibilité
     * CLIENT. La réponse est `{ success, data: { conversationId, deletedAt } }`.
     */
    if (chemin.endsWith('/delete-for-me') && requete.method === 'DELETE') {
      const conversationId = chemin.slice('/api/v1/conversations/'.length, -'/delete-for-me'.length);
      etat.masquees.add(conversationId);
      json({ success: true, data: { conversationId, deletedAt: new Date().toISOString() } });
      return true;
    }

    if (chemin.startsWith('/api/v1/conversations')) {
      if (etat.lecteurSansRien) {
        json({ success: true, data: [], pagination: { total: 0 } });
        return true;
      }
      /**
       * LA LIGNE DE LISTE TELLE QUE `GET /conversations` LA SERT
       * (`routes/conversations/core-list.ts:776-830`) : `lastMessage` (dont le
       * `content` est déjà plafonné par `truncateMessagePreview`), la paire du
       * Prisme au niveau CONVERSATION (`lastMessageOriginalLanguage`,
       * `lastMessageTranslations` — une carte `{ langue: aperçu }` restreinte au
       * prisme du lecteur) et `userPreferences`, un TABLEAU d'au plus une
       * entrée (`take: 1` sur `userId`).
       */
      const prefs = (id: string) => [{ isPinned: false, isMuted: false, isArchived: false, ...(etat.preferences.get(id) ?? {}) }];
      const lignes = [
        {
          id: CONVERSATION_DU_LECTEUR.id,
          identifier: 'lagos',
          title: CONVERSATION_DU_LECTEUR.titre,
          type: 'group',
          memberCount: CONVERSATION_DU_LECTEUR.membres,
          unreadCount: CONVERSATION_DU_LECTEUR.nonLus,
          lastMessageAt: new Date(Date.now() - 30 * 60_000).toISOString(),
          lastMessage: { id: 'm-apercu', content: 'On se cale à 15 h pour la revue ?' },
          lastMessageOriginalLanguage: 'fr',
          lastMessageTranslations: null,
          userPreferences: prefs(CONVERSATION_DU_LECTEUR.id),
        },
        {
          id: AUTRE_CONVERSATION.id,
          identifier: 'marta',
          title: AUTRE_CONVERSATION.titre,
          type: 'direct',
          memberCount: AUTRE_CONVERSATION.membres,
          unreadCount: AUTRE_CONVERSATION.nonLus,
          lastMessageAt: new Date(Date.now() - 3 * 3_600_000).toISOString(),
          lastMessage: { id: 'm-apercu-2', content: AUTRE_CONVERSATION.apercu },
          lastMessageOriginalLanguage: AUTRE_CONVERSATION.langueOriginale,
          lastMessageTranslations: AUTRE_CONVERSATION.traductions,
          userPreferences: prefs(AUTRE_CONVERSATION.id),
          // L'AUTRE personne du tête-à-tête (§ 12.10.3) : son avatar, dans
          // `/chats`, ouvre son profil — `homologueDe` l'élit en excluant
          // `MEMBRE.id` de cette liste.
          participants: [
            { userId: PAIR_HISPANOPHONE.id, displayName: PAIR_HISPANOPHONE.nom },
            { userId: MEMBRE.id, displayName: MEMBRE.nom },
          ],
        },
        /**
         * SEUL `delete-for-me` FILTRE ICI, parce que seul lui filtre EN
         * PRODUCTION : `whereClause` exclut les participations dont
         * `deletedForMe` est posé (`routes/conversations/core-list.ts:176-190`).
         *
         * `isArchived`, LUI, N'EST PAS FILTRÉ PAR LA PASSERELLE — sa seule
         * occurrence dans la route est le `select` qui le SERT
         * (`core-selects.ts:65`, déclaré au contrat wire
         * `conversationMinimalSchema.userPreferences`). Le bouchon le filtrait,
         * et ce filtre rendait VERTS onze témoins de `/chats` contre un serveur
         * qui n'existe pas : c'est exactement le « vert obtenu contre un bouchon
         * qui ne ressemble pas au serveur ». Écarter l'archivée est le travail
         * du CLIENT (`lib/api/compte.ts` › `sansArchivees`), et c'est lui que la
         * suite doit prouver.
         */
      ].filter((ligne) => !etat.masquees.has(ligne.id));

      json({ success: true, data: lignes, pagination: { total: 7 } });
      return true;
    }

    // `/api/v1/links` est servi par `bouchon-carnet.ts` (#4933) — jamais ici.
    return false;
  };
