import type { IncomingMessage } from 'node:http';

import { JETON_DU_MEMBRE, PARTICIPANT_DE_L_INVITE, type Identite } from './bouchon-socket';
import type { PlaceDeLInvite } from './bouchon-fil';
import {
  CONVERSATION_DU_LECTEUR,
  CREATEUR_DU_LIEN,
  DESCRIPTION_DU_LIEN,
  IDENTIFIANT_DU_LIEN_PARTAGE,
  LIEN_DU_FIL,
  MEMBRE,
  NOM_DU_LIEN,
  PSEUDO_DEJA_PRIS,
  PSEUDO_SUGGERE,
  type MessageServi,
} from './bouchon-monde';

/**
 * LES ROUTES DU LIEN, côté passerelle de bouchon — ce que `/l/:token` et
 * `/chat/:lien` demandent AUTOUR d'une place : résoudre un jeton tracé,
 * apercevoir un lien, y entrer, y reconnaître une place. Séparées de
 * `serveurs.ts` pour tenir le budget de taille (800–1100 lignes, CLAUDE.md),
 * jamais pour tenir une autre vérité : l'état du lien (`LienDeBouchon`) est
 * le MÊME objet que le battement et la liste relisent (`bouchon-fil.ts`).
 *
 * L'IDENTITÉ VIENT DE LA CRÉANCE, ET UNE CRÉANCE ILLISIBLE N'EST PERSONNE.
 * `createAuthContext` (`middleware/auth.ts:186-203`) ne regarde que le
 * `Bearer` dès qu'il y en a un ; un jeton qu'il ne sait pas lire fait JETER
 * (`:494-515`, « Invalid JWT token ») et, sous `optionalAuth`, la porte retombe
 * sur un contexte NON authentifié (`:770-780`) — sans jamais consulter
 * `X-Session-Token`. `deriveLinkAdmissionIdentity` (`link-admission.ts:
 * 101-108`) en fait alors un VISITEUR : un porteur de jeton périmé qui pousse
 * la porte de jonction y est admis comme invité, sous un pseudo généré
 * (`joinAsGuest`, `:213-216`), en consommant une place. Un bouchon qui faisait
 * de tout `Bearer` un membre rendait vert un client qui joignait un fantôme
 * (leçon 422 : un bouchon copie une LOI, pas une réponse).
 */

/**
 * L'ÉTAT DU LIEN DE PARTAGE, tel que la LOI d'admission le lit
 * (`LinkAdmissionShareLink`, `services/conversations/linkAdmission.ts:89-102`)
 * et tel que `performLinkJoin` valide la saisie (`routes/conversations/
 * link-admission.ts:405-436`). Un bouchon copie une LOI, pas une réponse
 * (leçon 422) : un spec ne dicte pas un code, il change l'ÉTAT du lien, et le
 * bouchon rend ce que la passerelle rendrait — l'aperçu (`routes/anonymous.ts:
 * 600-613`) et la jonction (`admitLinkEntry`) n'ayant pas le même vocabulaire
 * pour le même lien, un état sert les deux vocabulaires.
 */
export type LienDeBouchon = {
  actif: boolean;
  /** `expiresAt`, ISO ; `null` = sans échéance. */
  expireA: string | null;
  /** `isConversationClosed(conversation)` — la clôture porte sur ce vers quoi le lien POINTE. */
  conversationClose: boolean;
  maxUses: number | null;
  currentUses: number;
  maxConcurrentUsers: number | null;
  currentConcurrentUsers: number;
  allowedIpRanges: readonly string[];
  requireAccount: boolean;
  requireNickname: boolean;
  requireEmail: boolean;
  requireBirthday: boolean;
  allowedLanguages: readonly string[];
  /** Les comptes bannis de la conversation — `resolveConversationEntry` ⇒ `banned` (`linkAdmission.ts:231`). */
  bannis: Set<string>;
};

export const lienParDefaut = (): LienDeBouchon => ({
  actif: true,
  expireA: null,
  conversationClose: false,
  maxUses: null,
  currentUses: 12,
  maxConcurrentUsers: null,
  currentConcurrentUsers: 0,
  allowedIpRanges: [],
  requireAccount: false,
  requireNickname: true,
  requireEmail: false,
  requireBirthday: false,
  allowedLanguages: [],
  bannis: new Set(),
});

/** `isIpInRange` (`services/gateway/src/utils/ip-range.ts:82-92`) : CIDR, plage `a-b`, ou adresse exacte — IPv4. */
const entier = (ip: string): number | null => {
  const octets = ip.trim().split('.').map(Number);
  if (octets.length !== 4 || octets.some((o) => !Number.isInteger(o) || o < 0 || o > 255)) return null;
  return ((octets[0]! << 24) | (octets[1]! << 16) | (octets[2]! << 8) | octets[3]!) >>> 0;
};
const dansLaPlage = (ip: string, plage: string): boolean => {
  const valeur = entier(ip);
  if (valeur === null) return false;
  if (plage.includes('/')) {
    const [reseau, prefixe] = plage.split('/');
    const base = entier(reseau ?? '');
    const bits = Number(prefixe);
    if (base === null || !Number.isInteger(bits) || bits < 0 || bits > 32) return false;
    if (bits === 0) return true;
    const masque = (0xffffffff << (32 - bits)) >>> 0;
    return (valeur & masque) === (base & masque);
  }
  if (plage.includes('-')) {
    const [debut, fin] = plage.split('-').map((b) => entier(b));
    return debut !== null && fin !== null && debut !== undefined && fin !== undefined && valeur >= debut && valeur <= fin;
  }
  return entier(plage) === valeur;
};

type Verdict = { readonly statut: number; readonly code: string; readonly message: string };

/**
 * `admitLinkEntry` (`linkAdmission.ts:166-236`), dans l'ORDRE fixé par #4167 :
 * isActive → expiresAt → conversation close → maxUses → maxConcurrentUsers →
 * allowedIpRanges → requireAccount → bannissement.
 */
const admission = (lien: LienDeBouchon, identite: { readonly genre: 'guest' } | { readonly genre: 'registered'; readonly id: string }, ip: string): Verdict | null => {
  if (!lien.actif) return { statut: 410, code: 'LINK_EXPIRED', message: "Ce lien n'est plus actif" };
  if (lien.expireA !== null && Date.parse(lien.expireA) < Date.now()) return { statut: 410, code: 'LINK_EXPIRED', message: 'Ce lien a expiré' };
  if (lien.conversationClose) return { statut: 410, code: 'CONVERSATION_CLOSED', message: 'Cette conversation est terminée' };
  if (lien.maxUses !== null && lien.currentUses >= lien.maxUses) return { statut: 409, code: 'LINK_EXHAUSTED', message: "Ce lien a atteint sa limite d'utilisation" };
  if (lien.maxConcurrentUsers !== null && lien.currentConcurrentUsers >= lien.maxConcurrentUsers) {
    return { statut: 409, code: 'LINK_EXHAUSTED', message: "Nombre maximum d'utilisateurs concurrents atteint" };
  }
  if (lien.allowedIpRanges.length > 0 && !lien.allowedIpRanges.some((plage) => dansLaPlage(ip, plage))) {
    return { statut: 403, code: 'REGION_NOT_ALLOWED', message: 'Accès non autorisé depuis votre adresse IP' };
  }
  if (identite.genre === 'guest' && lien.requireAccount) return { statut: 403, code: 'ACCOUNT_REQUIRED', message: 'Un compte est requis pour rejoindre cette conversation' };
  if (identite.genre === 'registered' && lien.bannis.has(identite.id)) return { statut: 403, code: 'BANNED', message: 'Vous avez été banni de cette conversation' };
  return null;
};

/** `normalizeLanguageForDedup`, réduite à ce que le bouchon compare : la langue de base, en minuscules. */
const langueDeBase = (langue: string): string => langue.trim().toLowerCase().split(/[-_]/)[0] ?? '';

/** `request.ip` sous `trustProxy` : le maillon le plus à droite de `X-Forwarded-For` qu'aucun proxy de confiance n'a écrit — ici, le seul. */
const ipDe = (requete: IncomingMessage): string => {
  const xff = requete.headers['x-forwarded-for'];
  const brut = Array.isArray(xff) ? xff[0] : xff;
  const derniere = (brut ?? '').split(',').map((p) => p.trim()).filter(Boolean).pop();
  return derniere ?? requete.socket.remoteAddress ?? '127.0.0.1';
};

const jetonDuChemin = (chemin: string): string =>
  decodeURIComponent(chemin.split('?')[0]?.split('/').filter(Boolean).pop() ?? '');

/**
 * LA CRÉANCE, lue comme `createAuthContext` la lit (`middleware/auth.ts:186-203`) :
 * un `Bearer` présent est la SEULE créance regardée — celui de la passerelle de
 * bouchon (`JETON_DU_MEMBRE`, sa « signature ») fait un membre, tout autre fait
 * PERSONNE (jeton illisible ⇒ contexte non authentifié, `X-Session-Token`
 * ignoré) ; sans `Bearer`, une session ACTIVE fait un invité.
 */
export const creanceSelonLaPasserelle = (requete: IncomingMessage, placesActives: ReadonlySet<string>): Identite | null => {
  const porteur = requete.headers.authorization ?? '';
  if (porteur.startsWith('Bearer ')) return porteur.slice(7) === JETON_DU_MEMBRE ? { genre: 'membre', id: MEMBRE.id } : null;
  const session = requete.headers['x-session-token'];
  if (typeof session === 'string' && placesActives.has(session)) return { genre: 'invite', id: PARTICIPANT_DE_L_INVITE };
  return null;
};

/**
 * TROIS CHAÎNES POUR `/l/:token`, PARCE QUE LA PRODUCTION EN PRODUIT TROIS — et
 * une seule d'entre elles bouge les deux portes.
 *
 * Un jeton `/l/:token` est soit un `ConversationShareLink` (invitation), soit un
 * `TrackingLink` (story, réel, post, humeur, lien externe : tout le § P0). Ce
 * sont deux modèles disjoints, et `GET /anonymous/link/:identifier` n'en connaît
 * qu'un : il rend 404 sur un jeton de tracking, TOUJOURS. Un bouchon qui
 * refuserait « des deux côtés » pour tout jeton raconterait donc une chaîne que
 * la production ne produit jamais — et c'est exactement ce qui a laissé passer
 * un écran servant « Indéterminé » à la moitié du produit.
 *
 *   • `refusParJeton` — une INVITATION close : `resolve` la dit `isActive:false`
 *     et l'aperçu NOMME le refus par un 410. Les deux portes parlent.
 *   • `trackingFermeParJeton` — un lien de TRACKING clos : `resolve` le dit
 *     `isActive:false` avec son `expiresAt` (la valeur du dictionnaire), et
 *     l'aperçu rend 404. Une seule porte parle, et c'est la seule qui répond aux
 *     deux familles.
 *   • `inconnus` — un jeton que la passerelle ne trouve pas : les deux portes
 *     rendent 404, et rien ne doit être NOMMÉ (§ 5.1, oracle d'énumération).
 */
export type JetonsTraces = {
  readonly actif: boolean;
  readonly refusParJeton: Readonly<Record<string, string>>;
  /** Jeton de tracking clos → son `expiresAt` ISO, ou `null` s'il n'en a pas. */
  readonly trackingFermeParJeton: Readonly<Record<string, string | null>>;
  readonly inconnus: readonly string[];
};

export type EtatDuLienDeBouchon = {
  readonly conversationId: string;
  readonly lien: LienDeBouchon;
  readonly placesActives: Set<string>;
  /** Les sessions RÉVOQUÉES (`revokeShareLinkGuests`) : la ligne existe, `isActive:false` — 410 `GUEST_ACCESS_REVOKED` sur toute porte `authOptional`. */
  readonly sessionsRevoquees: ReadonlySet<string>;
  readonly invite: { readonly id: string; nom: string; readonly session: string; readonly place: PlaceDeLInvite };
  readonly messages: () => readonly MessageServi[];
  readonly creanceDe: (requete: IncomingMessage) => Identite | null;
  readonly jetons: JetonsTraces;
};

type Reponse = (corps: unknown, statut?: number) => void;

export const routesDuLien =
  (etat: EtatDuLienDeBouchon) =>
  async ({
    requete,
    url,
    corps,
    json,
    erreur,
  }: {
    readonly requete: IncomingMessage;
    readonly url: URL;
    readonly corps: Buffer;
    readonly json: Reponse;
    readonly erreur: (statut: number, code: string, message: string, extra?: Record<string, unknown>) => void;
  }): Promise<boolean> => {
    const methode = requete.method ?? 'GET';
    const chemin = url.pathname;
    const { lien, invite } = etat;
    const lisLeCorps = (): Record<string, unknown> => {
      try {
        return JSON.parse(corps.toString('utf8')) as Record<string, unknown>;
      } catch {
        return {};
      }
    };

    /**
     * `POST /api/v1/links/:key/members` — la porte CANONIQUE (`link-admission.ts:
     * 688-770`), qui rend ce que `performLinkJoin` (`:405-449`) rend, dans son
     * ORDRE : 404 quand la clé n'est ni `linkId` ni `identifier` (`:626`) ; la
     * loi d'admission (`admitLinkEntry`, six codes — 410 `LINK_EXPIRED` /
     * `CONVERSATION_CLOSED`, 409 `LINK_EXHAUSTED`, 403 `REGION_NOT_ALLOWED` /
     * `ACCOUNT_REQUIRED` / `BANNED`) ; 403 `LANGUAGE_NOT_ALLOWED` (`:631`) ;
     * 400 dont la PHRASE est le code — `sendBadRequest(message)`,
     * `utils/response.ts:118-124` — quand un champ exigé manque (`:428-436`) ou
     * que Zod refuse le corps (`:766`, « Données invalides ») ; 409
     * `USERNAME_TAKEN_IN_CONVERSATION` + `suggestedNickname` à la RACINE
     * (`:635-638`, `response.ts:83`) ; puis 201 `{ sessionToken,
     * conversationId, participantId, entry: { outcome, canViewHistory, rights }
     * }` pour un visiteur, 200 `{ …, entry: { outcome: 'already-member' } }`
     * pour un porteur de jeton. L'identité vient de la CRÉANCE, jamais du
     * chemin (`deriveLinkAdmissionIdentity`, `:106-113`) — et un `Bearer` que
     * la passerelle ne sait pas lire est un VISITEUR (doc-tête).
     */
    const jonction = /^\/api\/v1\/links\/([^/]+)\/members$/.exec(chemin);
    if (jonction !== null && methode === 'POST') {
      const cle = decodeURIComponent(jonction[1] ?? '');
      if (cle !== LIEN_DU_FIL && cle !== IDENTIFIANT_DU_LIEN_PARTAGE) {
        erreur(404, 'Lien de conversation introuvable', 'Lien de conversation introuvable');
        return true;
      }
      const corpsLu = lisLeCorps();
      const identite = etat.creanceDe(requete)?.genre === 'membre' ? ({ genre: 'registered', id: MEMBRE.id } as const) : ({ genre: 'guest' } as const);

      const verdict = admission(lien, identite, ipDe(requete));
      if (verdict !== null) {
        erreur(verdict.statut, verdict.code, verdict.message);
        return true;
      }
      const langue = typeof corpsLu.language === 'string' ? corpsLu.language : 'fr';
      if (lien.allowedLanguages.length > 0 && !lien.allowedLanguages.some((l) => langueDeBase(l) === langueDeBase(langue))) {
        erreur(403, 'LANGUAGE_NOT_ALLOWED', 'Langue non autorisée pour ce lien');
        return true;
      }
      const email = typeof corpsLu.email === 'string' ? corpsLu.email.trim() : '';
      const birthday = typeof corpsLu.birthday === 'string' ? corpsLu.birthday.trim() : '';
      // `linkMembersBodySchema` (`:575-581`) : un courriel qui n'en est pas un, une date qui n'est pas ISO ⇒ Zod ⇒ 400.
      if ((email !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) || (birthday !== '' && Number.isNaN(Date.parse(birthday))) || (birthday !== '' && !/T/.test(birthday))) {
        erreur(400, 'Données invalides', 'Données invalides');
        return true;
      }
      const pseudo = typeof corpsLu.nickname === 'string' ? corpsLu.nickname.trim() : '';
      if (lien.requireEmail && email === '') {
        erreur(400, "L'email est obligatoire pour rejoindre cette conversation", "L'email est obligatoire pour rejoindre cette conversation");
        return true;
      }
      if (lien.requireBirthday && birthday === '') {
        erreur(400, 'La date de naissance est obligatoire pour rejoindre cette conversation', 'La date de naissance est obligatoire pour rejoindre cette conversation');
        return true;
      }
      if (identite.genre === 'guest' && lien.requireNickname && pseudo === '') {
        erreur(400, "Le nom d'utilisateur est obligatoire pour rejoindre cette conversation", "Le nom d'utilisateur est obligatoire pour rejoindre cette conversation");
        return true;
      }
      if (identite.genre === 'registered') {
        json({
          success: true,
          data: { conversationId: etat.conversationId, participantId: 'p-amina', entry: { outcome: 'already-member', canViewHistory: true } },
        });
        return true;
      }
      if (pseudo.toLowerCase() === PSEUDO_DEJA_PRIS) {
        erreur(409, 'USERNAME_TAKEN_IN_CONVERSATION', "Ce nom d'utilisateur est déjà utilisé dans cette conversation", {
          suggestedNickname: PSEUDO_SUGGERE,
        });
        return true;
      }
      // `joinAsGuest` : +1 sur les trois compteurs, une place ACTIVE (`link-admission.ts:283-296`),
      // le pseudo posté devient le `displayName` que le battement rend — ou un pseudo GÉNÉRÉ quand
      // rien n'est posté (`generateNickname`, `:213-216`) —, et les `allow*` du lien deviennent
      // l'INSTANTANÉ `Participant.permissions` — ce que `entry.rights` énonce (`:640-662`).
      lien.currentUses += 1;
      lien.currentConcurrentUsers += 1;
      etat.placesActives.add(invite.session);
      invite.nom = pseudo === '' ? PSEUDO_GENERE : pseudo;
      const rights = invite.place.rejoins();
      json(
        {
          success: true,
          data: {
            sessionToken: invite.session,
            conversationId: etat.conversationId,
            participantId: invite.id,
            entry: { outcome: 'new', canViewHistory: rights.canViewHistory, rights },
          },
        },
        201,
      );
      return true;
    }

    /**
     * `GET /api/v1/links/:identifier` — `routes/links/retrieval.ts:40`,
     * `authOptional` (`requireAuth: false, allowAnonymous: true`). LA
     * RECONNAISSANCE d'une place : `hasAccess = anonymousParticipant
     * .shareLinkId === shareLink.id` (`:196-197`) pour une session — SANS
     * regarder `isActive`, `expiresAt` ni `maxUses` ; un compte est membre ou
     * voit l'aperçu (`memberRow !== null || canPreview`, `:189`) ; sans
     * créance, `canPreview = isActive && allowViewHistory` (`:173`). Une place
     * révoquée est refusée EN AMONT par le middleware (410
     * `GUEST_ACCESS_REVOKED`, `middleware/auth.ts:561`, `:758-764`) ; un jeton
     * inconnu retombe en visiteur (`:770-772`). Le 200 sert `link.linkId` — la
     * clé CANONIQUE — et la conversation (`:292-313`).
     */
    const reconnaissance = /^\/api\/v1\/links\/([^/]+)$/.exec(chemin);
    if (reconnaissance !== null && methode === 'GET') {
      const cle = decodeURIComponent(reconnaissance[1] ?? '');
      if (cle !== LIEN_DU_FIL && cle !== IDENTIFIANT_DU_LIEN_PARTAGE) {
        erreur(404, 'Lien de partage non trouvé', 'Lien de partage non trouvé');
        return true;
      }
      const session = requete.headers['x-session-token'];
      if (typeof session === 'string' && etat.sessionsRevoquees.has(session)) {
        erreur(410, 'GUEST_ACCESS_REVOKED', "L'acces de cet invite a ete retire");
        return true;
      }
      const identite = etat.creanceDe(requete);
      const canPreview = lien.actif && invite.place.lien.allowViewHistory;
      // Le bouchon n'a qu'UN lien : toute session active y tient sa place ; le membre l'est.
      if (identite === null && !canPreview) {
        erreur(403, 'Accès non autorisé à ce lien', 'Accès non autorisé à ce lien');
        return true;
      }
      const userType = identite?.genre === 'membre' ? 'member' : 'anonymous';
      json({
        success: true,
        data: {
          conversation: { id: etat.conversationId, title: NOM_DU_LIEN, description: DESCRIPTION_DU_LIEN, type: 'group' },
          // Les `allow*` du LIEN, vivants (`:292-313`) — pas l'instantané d'une place.
          link: {
            id: 'l1',
            linkId: LIEN_DU_FIL,
            name: NOM_DU_LIEN,
            description: DESCRIPTION_DU_LIEN,
            ...invite.place.lien,
            requireAccount: lien.requireAccount,
            requireEmail: lien.requireEmail,
            requireNickname: lien.requireNickname,
            requireBirthday: lien.requireBirthday,
            expiresAt: lien.expireA,
            isActive: lien.actif,
          },
          userType,
          ...(userType === 'member' ? { redirectTo: `/conversations/${etat.conversationId}` } : {}),
          messages: [],
          stats: { totalMessages: etat.messages().length, totalMembers: 8, totalAnonymousParticipants: 4, onlineAnonymousParticipants: 0, hasMore: false, membersHasMore: false, anonymousParticipantsHasMore: false },
          members: [],
          anonymousParticipants: [],
          // `currentUser` (`:248-262`) NOMME l'occupant d'une session : `id` = `Participant.id`, `username` = son pseudo, `displayName` absent.
          currentUser:
            identite?.genre === 'invite'
              ? { id: invite.id, username: invite.nom, firstName: invite.nom, lastName: '', language: 'fr', isMeeshyer: false, permissions: invite.place.resolus() }
              : null,
        },
      });
      return true;
    }

    if (chemin.includes('/resolve')) {
      const jeton = jetonDuChemin(chemin.replace('/resolve', ''));
      if (etat.jetons.inconnus.includes(jeton)) {
        erreur(404, 'NOT_FOUND', 'NOT_FOUND');
        return true;
      }
      const echeance = etat.jetons.trackingFermeParJeton[jeton];
      if (echeance !== undefined) {
        json({
          success: true,
          data: { kind: 'tracking', targetType: 'STORY', targetId: 'story-interne', originalUrl: null, isActive: false, expiresAt: echeance },
        });
        return true;
      }
      json({
        success: true,
        data: {
          kind: 'conversation',
          targetType: 'CONVERSATION',
          targetId: 'conv-interne',
          originalUrl: null,
          isActive: etat.jetons.refusParJeton[jeton] === undefined && etat.jetons.actif,
          expiresAt: null,
        },
      });
      return true;
    }

    if (chemin.includes('/anonymous/link/')) {
      const jeton = jetonDuChemin(chemin);
      // La porte que la production n'ouvre QUE pour une invitation.
      if (etat.jetons.inconnus.includes(jeton) || etat.jetons.trackingFermeParJeton[jeton] !== undefined) {
        erreur(404, 'NOT_FOUND', 'NOT_FOUND');
        return true;
      }
      const code = etat.jetons.refusParJeton[jeton];
      if (code !== undefined) {
        erreur(410, code, 'refus');
        return true;
      }
      // Les trois gardes de l'aperçu, dans leur ordre (`routes/anonymous.ts:603-613`) — et
      // SEULEMENT elles : une conversation close ou un plafond de simultanéité atteint ne
      // se voient qu'à la jonction, l'aperçu les sert 200.
      if (!lien.actif) {
        erreur(410, 'LINK_INACTIVE', "Ce lien n'est plus actif");
        return true;
      }
      if (lien.expireA !== null && Date.parse(lien.expireA) < Date.now()) {
        erreur(410, 'LINK_EXPIRED', 'Ce lien a expire');
        return true;
      }
      if (lien.maxUses !== null && lien.currentUses >= lien.maxUses) {
        erreur(410, 'LINK_MAX_USES', "Ce lien a atteint sa limite d'utilisation");
        return true;
      }
      /**
       * `GET /api/v1/anonymous/link/:identifier` — `routes/anonymous.ts:442-540`,
       * projeté par `anonymousLinkPreviewSelect` : le `creator` COMPLET part
       * (c'est la fuite du § 5.1 que le consommateur doit retenir), avec les
       * exigences du lien et l'effectif.
       */
      json({
        success: true,
        data: {
          id: 'l1',
          linkId: LIEN_DU_FIL,
          name: NOM_DU_LIEN,
          description: DESCRIPTION_DU_LIEN,
          expiresAt: lien.expireA,
          maxUses: lien.maxUses,
          currentUses: lien.currentUses,
          maxConcurrentUsers: lien.maxConcurrentUsers,
          currentConcurrentUsers: lien.currentConcurrentUsers,
          requireAccount: lien.requireAccount,
          requireNickname: lien.requireNickname,
          requireEmail: lien.requireEmail,
          requireBirthday: lien.requireBirthday,
          allowedLanguages: lien.allowedLanguages,
          creator: { id: 'u1', username: CREATEUR_DU_LIEN, email: `${CREATEUR_DU_LIEN}@example.com` },
          conversation: { id: etat.conversationId, title: NOM_DU_LIEN, description: DESCRIPTION_DU_LIEN, type: 'group' },
          stats: { totalParticipants: CONVERSATION_DU_LECTEUR.membres, memberCount: 8, anonymousCount: 4, languageCount: 3, spokenLanguages: ['fr', 'en', 'es'] },
        },
      });
      return true;
    }

    return false;
  };

/** Le pseudo qu'une jonction SANS `nickname` reçoit — `generateNickname` (`link-admission.ts:213-216`) : la forme, pas la valeur. */
export const PSEUDO_GENERE = 'Invité-4f2a';
