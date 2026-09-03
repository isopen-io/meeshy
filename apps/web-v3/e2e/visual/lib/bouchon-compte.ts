import type { IncomingMessage } from 'node:http';

import type { Identite } from './bouchon-socket';
import { CONVERSATION_DU_LECTEUR, IDENTIFIANT_DU_LIEN_PARTAGE, LIEN_DU_FIL, MEMBRE, PRENOM_DU_LECTEUR } from './bouchon-monde';

/**
 * LES NEUF ROUTES DE LA ZONE CONNECTÉE, copiées sur la passerelle RÉELLE :
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
 *   • `GET /api/v1/conversations/search` — `routes/conversations/search.ts:67`,
 *     qui rend un tableau NU de `conversationMinimalSchema` : ni `pagination`,
 *     ni total. Le bouchon ne lui en invente pas ;
 *   • `GET /api/v1/directory/people` — `routes/directory/people.ts:105`, qui
 *     pagine par CURSEUR (`hasMore`, `nextCursor`, `limit`) et déclare
 *     `isOnline` NULLABLE — l'autre forme du masquage, à côté du `false` de
 *     `/directory/contacts` ;
 *   • `GET /api/v1/posts/:postId` — `routes/posts/core.ts:460`,
 *     `preValidation: [requiredAuth]` ;
 *   • `GET /api/v1/posts/:postId/comments` — `routes/posts/comments.ts:61`,
 *     même garde, servant `{ success, data, pagination }` SANS schéma de
 *     réponse déclaré — donc sans rien retirer.
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
 * Ce que la RECHERCHE trouve — un fil et une personne, de quoi peindre les deux
 * groupes que l'écran sert. Le fil est celui du lecteur : sa ligne mène quelque
 * part, ce que l'audit vérifie.
 */
const RECHERCHE_FILS = [
  {
    id: CONVERSATION_DU_LECTEUR.id,
    identifier: 'lagos',
    title: CONVERSATION_DU_LECTEUR.titre,
    type: 'group',
    isActive: true,
    memberCount: CONVERSATION_DU_LECTEUR.membres,
    lastMessageAt: new Date(Date.now() - 30 * 60_000).toISOString(),
    createdAt: new Date(Date.now() - 30 * 24 * 3_600_000).toISOString(),
    participants: [],
  },
];

/** `isOnline` y est NULLABLE — c'est la forme que `/directory/people` déclare. */
const RECHERCHE_GENS = [
  {
    id: 'u-sara',
    username: 'sarakim',
    displayName: 'Sara Kim',
    avatar: null,
    isOnline: null,
    lastActiveAt: null,
  },
];

export const routesDuCompte =
  (etat: EtatDuCompteDeBouchon) =>
  ({ requete, url, json }: { readonly requete: IncomingMessage; readonly url: URL; readonly json: Reponse }): boolean => {
    const chemin = url.pathname;
    if (
      !(
        chemin.startsWith('/api/v1/auth/me') ||
        chemin.startsWith('/api/v1/conversations') ||
        chemin.startsWith('/api/v1/links') ||
        chemin.startsWith('/api/v1/directory/') ||
        chemin.startsWith('/api/v1/posts/')
      )
    ) {
      return false;
    }

    const porteur = requete.headers.authorization ?? '';
    if (!porteur.startsWith('Bearer ')) {
      json({ error: 'Authentication required', code: 'AUTH_REQUIRED' }, 401);
      return true;
    }
    if (etat.creanceDe(requete)?.genre !== 'membre') {
      json({ error: 'Invalid JWT token', code: 'AUTH_FAILED' }, 401);
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
        },
      });
      return true;
    }

    // La RECHERCHE, avant `/api/v1/conversations` nue : Fastify distingue ces
    // deux routes par leur chemin complet, et un bouchon qui teste des préfixes
    // doit ordonner du plus PRÉCIS au plus général — sinon `/conversations`
    // avale `/conversations/search` et l'écran de recherche reçoit la liste du
    // tableau de bord.
    // Le FIL d'une publication, avant la publication elle-même : Fastify
    // distingue ces deux routes par leur chemin complet, et un bouchon qui
    // teste des préfixes ordonne du plus PRÉCIS au plus général.
    if (/^\/api\/v1\/posts\/[^/]+\/comments/.test(chemin)) {
      json({
        success: true,
        data: COMMENTAIRES_DU_BOUCHON,
        pagination: { limit: 30, hasMore: false, nextCursor: null },
        meta: { mentionedUsers: [] },
      });
      return true;
    }

    if (/^\/api\/v1\/posts\/[^/]+$/.test(chemin)) {
      json({ success: true, data: PUBLICATION_DU_BOUCHON });
      return true;
    }

    if (chemin.startsWith('/api/v1/conversations/search')) {
      json({ success: true, data: url.searchParams.get('q') ? RECHERCHE_FILS : [] });
      return true;
    }

    if (chemin.startsWith('/api/v1/directory/people')) {
      json({
        success: true,
        data: url.searchParams.get('q') ? RECHERCHE_GENS : [],
        pagination: { hasMore: false, nextCursor: null, limit: 20 },
      });
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

    if (chemin.startsWith('/api/v1/conversations')) {
      if (etat.lecteurSansRien) {
        json({ success: true, data: [], pagination: { total: 0 } });
        return true;
      }
      json({
        success: true,
        data: [
          {
            id: CONVERSATION_DU_LECTEUR.id,
            identifier: 'lagos',
            title: CONVERSATION_DU_LECTEUR.titre,
            type: 'group',
            memberCount: CONVERSATION_DU_LECTEUR.membres,
            unreadCount: CONVERSATION_DU_LECTEUR.nonLus,
            lastMessageAt: new Date(Date.now() - 30 * 60_000).toISOString(),
          },
          {
            id: '68f2a81417a557e8ce4ddfbc',
            identifier: 'marta',
            title: 'Marta Ruiz',
            type: 'direct',
            memberCount: 2,
            unreadCount: 0,
            lastMessageAt: new Date(Date.now() - 3 * 3_600_000).toISOString(),
          },
        ],
        pagination: { total: 7 },
      });
      return true;
    }

    if (etat.lecteurSansRien) {
      json({ success: true, data: [], pagination: { total: 0 } });
      return true;
    }
    json({
      success: true,
      data: [
        {
          id: 'l1',
          linkId: LIEN_DU_FIL,
          identifier: IDENTIFIANT_DU_LIEN_PARTAGE,
          name: 'Ops Lagos',
          isActive: true,
          currentUses: 12,
          maxUses: null,
          expiresAt: null,
          conversation: { id: CONVERSATION_DU_LECTEUR.id, title: CONVERSATION_DU_LECTEUR.titre, type: 'group' },
        },
        // Un lien FERMÉ, avec sa capacité et son échéance : c'est la ligne que
        // le tableau de bord ÉCARTE et que l'écran `/links` doit garder. Sans
        // elle, l'audit ne verrait jamais l'étiquette « Fermé » ni la teinte
        // en sourdine — c'est-à-dire jamais le contraste qui les rend
        // lisibles.
        {
          id: 'l2',
          linkId: 'mshy_demo',
          identifier: 'demo-sept',
          name: 'Démo septembre',
          isActive: false,
          currentUses: 3,
          maxUses: 10,
          expiresAt: '2026-12-31T12:00:00.000Z',
          conversation: null,
        },
      ],
      pagination: { total: 2 },
      // `meta.summary` — les agrégats de TOUT le carnet, servis par
      // `?include=summary` (`routes/links/user.ts:611-613` puis `:624-630`).
      // Le compte des actifs n'est PAS celui de la page : le bouchon en sert
      // dix-sept pour deux lignes, ce qu'aucun décompte local ne pourrait
      // produire.
      meta: { summary: { totalLinks: 30, activeLinks: 17, totalUses: 400 } },
    });
    return true;
  };
