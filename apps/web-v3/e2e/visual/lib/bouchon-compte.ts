import type { IncomingMessage } from 'node:http';

import type { Identite } from './bouchon-socket';
import { CONVERSATION_DU_LECTEUR, IDENTIFIANT_DU_LIEN_PARTAGE, LIEN_DU_FIL, MEMBRE, PRENOM_DU_LECTEUR } from './bouchon-monde';

/**
 * LES CINQ ROUTES DE LA ZONE CONNECTÉE, copiées sur la passerelle RÉELLE :
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
 *     (`routes/users/contacts-schemas.ts:24`).
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

export const routesDuCompte =
  (etat: EtatDuCompteDeBouchon) =>
  ({ requete, url, json }: { readonly requete: IncomingMessage; readonly url: URL; readonly json: Reponse }): boolean => {
    const chemin = url.pathname;
    if (
      !(
        chemin.startsWith('/api/v1/auth/me') ||
        chemin.startsWith('/api/v1/conversations') ||
        chemin.startsWith('/api/v1/links') ||
        chemin.startsWith('/api/v1/directory/')
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
        data: { id: MEMBRE.id, username: 'amina', firstName: PRENOM_DU_LECTEUR, displayName: MEMBRE.nom, systemLanguage: 'fr' },
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
          conversation: { id: CONVERSATION_DU_LECTEUR.id, title: CONVERSATION_DU_LECTEUR.titre, type: 'group' },
        },
      ],
      pagination: { total: 1 },
    });
    return true;
  };
