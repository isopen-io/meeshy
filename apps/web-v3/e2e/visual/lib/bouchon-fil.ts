import type { IncomingMessage, ServerResponse } from 'node:http';

import { INVITE, MEMBRE, type MessageServi } from './bouchon-monde';
import { chargeDeMessage, evenementDeReaction, lieuValide, participantDe, PARTICIPANT_DU_MEMBRE, type BouchonSocket, type Identite, type MagasinDeReactions } from './bouchon-socket';

/**
 * LES ROUTES DU FIL, côté passerelle de bouchon — celles que le module de
 * participation et les deux portes appellent AUTOUR de la liste des messages :
 * le battement de bail, le rattrapage, les pièces jointes, les accusés de
 * lecture, les réactions. Chacune MIME la route réelle — chemin, méthode,
 * codes, forme de la charge — et nomme l'émetteur qu'elle copie. Séparées de
 * `serveurs.ts` pour tenir le budget de taille, jamais pour tenir une autre
 * vérité : l'état (places, lien, messages, réactions, pièces) est le MÊME
 * objet, passé d'un module à l'autre.
 *
 *   • `PATCH /guest-sessions/me` — `routes/conversations/link-admission.ts:
 *     775-855` : le jeton en `X-Session-Token`, JAMAIS dans le corps ; 400 sans
 *     jeton, 401 « Session invalide ou expirée » quand la place n'est plus
 *     active, 410 `LINK_DEACTIVATED` / `LINK_EXPIRED` / `CONVERSATION_CLOSED`,
 *     200 `participantConversationPayload` — l'INSTANTANÉ du join, jamais les
 *     droits en vigueur (`PlaceDeLInvite`). `POST /anonymous/refresh`
 *     (`routes/anonymous.ts:272-370`) reste servi comme l'ADAPTATEUR DÉPRÉCIÉ
 *     qu'il est (`:341`) — la v3 ne doit plus l'appeler, et le journal le
 *     montrerait ;
 *   • les droits que l'hôte CHANGE après le join ne passent par aucune de ces
 *     routes : `porteDeLHote` écrit le delta et fait DIFFUSER
 *     `participant:rights-updated` par le bouchon socket, comme
 *     `participants-writes.ts:320-425` ;
 *   • `GET /sync` — `routes/sync/index.ts:194-340` : `since`, `collections`,
 *     `scope`, `seq` ; `hasGap` par la LOI du serveur (`:274-279`) — une
 *     session anonyme n'a pas de curseur (`checkpointSeq` vaut 0 pour elle),
 *     un membre lit le curseur GLOBAL de son compte, et le trou n'existe que
 *     si `seq` est annoncé ET `seq < checkpointSeq - GAP_THRESHOLD`
 *     (`routes/sync/budget.ts:69`, 10 000). Sur un trou, les collections sont
 *     VIDES et `gapAction: 'full_resync_required'` (`:285-300`) ;
 *   • `POST /attachments/upload` — `routes/attachments/upload.ts:58-195` :
 *     `authOptional` puis `isAuthenticated` exigé (401), multipart en
 *     `request.parts()` (tout champ fichier), 400 sans fichier, 403 pour un
 *     anonyme dont le lien n'admet pas le TYPE (`classifyAnonymousAttachment`,
 *     `ContentSignature.ts:255-281` : image ⇒ `allowAnonymousImages`, sinon
 *     `allowAnonymousFiles` — **UN VOCAL EST TOUJOURS ADMIS** (`isAudio ⇒
 *     { allowed: true }`, `:266-269` : « la voix suit le droit d'écrire dans
 *     la conversation, pas le droit d'envoyer des fichiers » — #5061 § 2.3),
 *     200 `{ attachments: results }` — `AttachmentService.uploadMultiple`
 *     (`AttachmentService.ts:175-215`) : `id`, `fileUrl` RELATIF
 *     (`/api/v1/attachments/file/<chemin>`), `originalName`, `mimeType`,
 *     `fileSize`, `width`, `height`, `duration` ;
 *   • `GET /attachments/file/*` — `routes/attachments/download.ts:350` : le
 *     fichier par son chemin, 404 sinon ;
 *   • `POST /conversations/:id/receipts` — `routes/conversations/receipts.ts:
 *     946` : `requireAuth` + `allowAnonymous`, `{ type: 'read' | 'delivered',
 *     messageIds }`, réponse `{ type, markedCount, unreadCount }` (`:804-805`) ;
 *   • `POST /reactions` `{ messageId, emoji }` — `routes/reactions.ts:78` :
 *     201 à la création, 200 `unchanged` quand le participant l'avait déjà
 *     (`:188-194`, sans diffusion) ; `DELETE /reactions/:messageId/:emoji`
 *     (`:290`) : 200 dans les deux cas — un retrait déjà absent est IDEMPOTENT
 *     (`:379-386`) et ne diffuse pas. Les deux diffusent un
 *     `ReactionUpdateEvent` par le socket quand l'état a changé ;
 *   • le fil lui-même — `GET /conversations/:id` (`core-detail.ts:102`), `GET
 *     /conversations/:id/messages` (`messages-list.ts:64`, `before` / `around` /
 *     `limit`, du plus RÉCENT au plus ancien, `cursorPagination`), `POST
 *     /conversations/:id/messages` (`messages-send.ts:111`, `clientMessageId`
 *     dédupliqué). Les deux créances y sont acceptées (`optionalAuth`). Le
 *     CONTENU y est borné comme la passerelle le borne : `SendMessageBodySchema`
 *     (`messages-send.ts:41-48`) refuse au-delà de `MESSAGE_LIMITS.
 *     MAX_MESSAGE_LENGTH` (`config/message-limits.ts:13`, 4 000 par défaut) par
 *     `sendBadRequest(reply, 'Validation error', { message })` (`:194-196`) —
 *     le socket refuse le même texte par `validateMessageLength`
 *     (`bouchon-socket.ts`). Un bouchon qui acceptait 4 001 caractères rendait
 *     vert un composeur sans plafond (leçon 422).
 */

/**
 * `MESSAGE_LIMITS.MAX_MESSAGE_LENGTH` — `services/gateway/src/config/message-limits.ts:13`,
 * la valeur que la passerelle SERT sans réglage d'environnement ; la phrase est
 * celle de `SendMessageBodySchema` (`messages-send.ts:45`).
 */
export const LONGUEUR_MAX_DU_CONTENU = 4000;
export const PHRASE_DU_CONTENU_TROP_LONG = `Le message ne peut pas dépasser ${LONGUEUR_MAX_DU_CONTENU} caractères`;

/** `GAP_THRESHOLD` — `services/gateway/src/routes/sync/budget.ts:69`. */
export const SEUIL_DE_TROU = 10_000;

export type PieceDeBouchon = {
  readonly id: string;
  readonly fileUrl: string;
  readonly originalName: string;
  readonly mimeType: string;
  readonly fileSize: number;
  readonly octets: Buffer;
  /** `duration`, en millisecondes — ce qu'un vocal ou une vidéo annonce (`AttachmentService.uploadMultiple`) ; `null` sinon. */
  readonly duration?: number | null;
};

/** Les huit droits d'un invité (`GuestRights`, `services/participantRights.ts:55-64`) — l'état RÉSOLU que la jonction, la fiche et l'événement énoncent. */
export type DroitsDeLInvite = {
  readonly canSendMessages: boolean;
  readonly canSendFiles: boolean;
  readonly canSendImages: boolean;
  readonly canSendVideos: boolean;
  readonly canSendAudios: boolean;
  readonly canSendLocations: boolean;
  readonly canSendLinks: boolean;
  readonly canViewHistory: boolean;
};

/** Ce que le LIEN accorde à un invité — ses quatre `allow*` (`ConversationShareLink`), ce que l'hôte règle SUR LE LIEN. */
export type DroitsDuLien = {
  allowAnonymousMessages: boolean;
  allowAnonymousFiles: boolean;
  allowAnonymousImages: boolean;
  allowViewHistory: boolean;
};

export const LIEN_PAR_DEFAUT: DroitsDuLien = { allowAnonymousMessages: true, allowAnonymousFiles: false, allowAnonymousImages: false, allowViewHistory: true };

/**
 * LA PLACE DE L'INVITÉ, telle que la LOI la lit (`services/participantRights.ts:
 * 6-13`) — trois couches, et leur ordre est le sujet :
 *
 *   • `lien` — ce que le lien autorise AUJOURD'HUI : lu par la jonction, qui en
 *     prend une COPIE (`joinAsGuest`, `link-admission.ts:283-296`), par le
 *     téléversement, qui le lit VIVANT (`upload.ts:301-311`), et par la
 *     reconnaissance (`link.allow*`) ;
 *   • `permissions` — l'INSTANTANÉ pris au join (`Participant.permissions`) :
 *     c'est LUI que le battement rend (`participantConversationPayload`,
 *     `link-admission.ts:566-568`), avec `shareLink.allowViewHistory` (`:575`)
 *     — et non les droits en vigueur ;
 *   • `rights` — le DELTA posé par l'hôte (`anonymousSession.rights`, écrit par
 *     `PATCH …/participants/:id/rights`) : un droit qu'il ne nomme pas suit
 *     l'instantané (`??`, `resolveParticipantRights`).
 *
 * Un bouchon copie une LOI, pas une réponse (leçon 422) : c'est cette
 * séparation qui fait tomber un module qui attendrait du battement ce que
 * seul `participant:rights-updated` porte.
 */
export type PlaceDeLInvite = {
  readonly lien: DroitsDuLien;
  permissions: DroitsDeLInvite;
  readonly rights: Partial<{ -readonly [K in keyof DroitsDeLInvite]: DroitsDeLInvite[K] }>;
  /** `resolveEntryRights` — `rights ?? permissions`, `canViewHistory` compris. */
  readonly resolus: () => DroitsDeLInvite;
  /** Le join : l'instantané se (re)prend sur le lien, le delta s'efface — une place neuve. */
  readonly rejoins: () => DroitsDeLInvite;
  /** L'état de départ d'un spec : le lien règle, l'instantané le recopie, aucun delta. */
  readonly reinitialise: (lien?: Partial<DroitsDuLien>) => void;
};

/** `joinAsGuest` recopie les `allow*` du lien ; les quatre autres droits sont ceux d'une entrée par lien. */
const instantaneDe = (lien: DroitsDuLien): DroitsDeLInvite => ({
  canSendMessages: lien.allowAnonymousMessages,
  canSendFiles: lien.allowAnonymousFiles,
  canSendImages: lien.allowAnonymousImages,
  canSendVideos: false,
  canSendAudios: false,
  canSendLocations: false,
  canSendLinks: true,
  canViewHistory: lien.allowViewHistory,
});

export const placeDeLInvite = (): PlaceDeLInvite => {
  const lien: DroitsDuLien = { ...LIEN_PAR_DEFAUT };
  const rights: PlaceDeLInvite['rights'] = {};
  const place: PlaceDeLInvite = {
    lien,
    permissions: instantaneDe(lien),
    rights,
    resolus: () => ({
      ...place.permissions,
      ...Object.fromEntries(Object.entries(rights).filter(([, valeur]) => typeof valeur === 'boolean')),
    }),
    rejoins: () => {
      place.permissions = instantaneDe(lien);
      (Object.keys(rights) as (keyof DroitsDeLInvite)[]).forEach((nom) => delete rights[nom]);
      return place.resolus();
    },
    reinitialise: (sur = {}) => {
      Object.assign(lien, LIEN_PAR_DEFAUT, sur);
      place.rejoins();
    },
  };
  return place;
};

/** L'hôte de la conversation — `updatedBy` de l'événement (`participants-writes.ts:386`). */
export const HOTE = 'u1';

export type PorteDeLHote = {
  /**
   * `PATCH …/participants/:id/rights` par un hôte (`participants-writes.ts:
   * 320-425`) : le delta s'écrit — un droit ramené à sa valeur du join voit
   * son entrée EFFACÉE (`:325-329`) —, puis `participant:rights-updated` part
   * sur la room de conversation (sans `canViewHistory`) et, en charge complète,
   * sur la room personnelle de l'intéressé. Rend l'état résolu, comme le 200.
   */
  readonly changeLesDroits: (delta: Partial<DroitsDeLInvite>) => DroitsDeLInvite;
};

export const porteDeLHote = (etat: EtatDuFilDeBouchon): PorteDeLHote => ({
  changeLesDroits: (delta) => {
    const { place } = etat.invite;
    (Object.entries(delta) as [keyof DroitsDeLInvite, boolean | undefined][]).forEach(([nom, valeur]) => {
      if (typeof valeur !== 'boolean') return;
      if (place.permissions[nom] === valeur) delete place.rights[nom];
      else place.rights[nom] = valeur;
    });
    const rights = place.resolus();
    etat.socket().diffuseLesDroits({ conversationId: etat.conversationId, participantId: etat.invite.id, updatedBy: HOTE, rights });
    return rights;
  },
});

/** Un fil ANNEXE : une seconde conversation, adressable par son identifiant, servie en LECTURE seule. */
export type FilAnnexe = {
  readonly id: string;
  readonly titre: string;
  readonly membres: number;
  readonly messages: readonly MessageServi[];
};

export type EtatDuFilDeBouchon = {
  readonly conversationId: string;
  readonly titre: string;
  /**
   * Les conversations AUTRES que celle du lecteur, par identifiant — ce que
   * `GET /conversations/:id` et `GET /conversations/:id/messages` servent quand
   * l'adresse en nomme une. La passerelle réelle route évidemment par
   * identifiant ; le bouchon l'ignorait, si bien qu'une vue déclarant son
   * propre jeton de conversation n'avait aucune donnée derrière.
   */
  readonly filsAnnexes: ReadonlyMap<string, FilAnnexe>;
  readonly placesActives: Set<string>;
  /** La ligne du lien que le battement ET la liste relisent — l'état que `serveurs.ts` règle. */
  readonly lien: {
    actif: boolean;
    expireA: string | null;
    conversationClose: boolean;
    maxUses: number | null;
    currentUses: number;
  };
  /** Le curseur GLOBAL du compte du membre — ce que `sequenceService.currentSeq` rend. */
  readonly sync: {
    curseur: number;
    /**
     * Ce que la collection `conversations` de `/sync` sert au prochain appel —
     * réglé par un spec qui simule ce qui a bougé PENDANT une absence. Vide, la
     * fenêtre est inchangée et le validateur ne bouge pas : le retour de focus
     * rend 304.
     */
    conversations: Readonly<Record<string, unknown>>[];
  };
  readonly reactions: MagasinDeReactions;
  readonly pieces: Map<string, PieceDeBouchon>;
  readonly identifiants: { suivant: () => string };
  /** L'invité que la place désigne ; `nom` est le pseudo POSTÉ à la jonction, comme `displayName` en base ; `place`, ses trois couches de droits. */
  readonly invite: { readonly id: string; nom: string; readonly place: PlaceDeLInvite };
  readonly messages: () => readonly MessageServi[];
  /** Un message qui entre dans le fil — par la route, ou « pendant l'absence » du lecteur (`ajouteUnMessage`, `serveurs.ts`). */
  readonly ajouteUnMessage: (message: MessageServi) => void;
  /** `PUT /api/v1/messages/:id` ET `message:edit` (issue #5163) — le MÊME mutateur ; `null` = introuvable ou déjà supprimé. */
  readonly modifieUnMessage: (id: string, content: string) => MessageServi | null;
  /** `DELETE /api/v1/messages/:id` ET `message:delete`. */
  readonly retireUnMessage: (id: string) => MessageServi | null;
  /** La présence des pairs, telle que `connectedUsers` la tient — gardée par la visibilité à la fiche (`core-detail.ts:231-236`). */
  readonly presences: ReadonlyMap<string, boolean>;
  readonly membres: number;
  readonly socket: () => BouchonSocket;
  readonly creanceDe: (requete: IncomingMessage) => Identite | null;
};

type Reponse = (corps: unknown, statut?: number) => void;

const objet = (valeur: unknown): Record<string, unknown> =>
  typeof valeur === 'object' && valeur !== null && !Array.isArray(valeur) ? (valeur as Record<string, unknown>) : {};

/**
 * `participantConversationPayload` (`link-admission.ts:554-577`), servi par le
 * battement sous ses deux chemins — l'INSTANTANÉ du join (`participant.
 * permissions`, `:566-568`) et le drapeau du LIEN (`shareLink.allowViewHistory`,
 * `:575`) : jamais le delta de l'hôte, que seul `participant:rights-updated`
 * porte. Copier ici les droits en vigueur rendrait vert un module qui les
 * attendrait du battement (leçon 422).
 */
const chargeDeSession = (etat: EtatDuFilDeBouchon) => ({
  success: true,
  data: {
    participant: {
      id: etat.invite.id,
      username: etat.invite.nom,
      displayName: etat.invite.nom,
      firstName: etat.invite.nom,
      lastName: '',
      avatar: null,
      banner: null,
      language: 'fr',
      isMeeshyer: false,
      canSendMessages: etat.invite.place.permissions.canSendMessages,
      canSendFiles: etat.invite.place.permissions.canSendFiles,
      canSendImages: etat.invite.place.permissions.canSendImages,
    },
    conversation: { id: etat.conversationId, title: etat.titre, type: 'group', allowViewHistory: etat.invite.place.lien.allowViewHistory },
  },
});

/** Les parties d'un corps `multipart/form-data`, lues comme `@fastify/multipart` les rend : nom de champ, nom de fichier, type, octets. */
export const partiesMultipart = (corps: Buffer, contentType: string): readonly { readonly champ: string; readonly fichier: string | null; readonly type: string; readonly octets: Buffer }[] => {
  const frontiere = /boundary=("?)([^";]+)\1/.exec(contentType)?.[2];
  if (frontiere === undefined) return [];
  const separateur = Buffer.from(`--${frontiere}`);
  const parties: { champ: string; fichier: string | null; type: string; octets: Buffer }[] = [];
  let depart = corps.indexOf(separateur);
  while (depart !== -1) {
    const debut = depart + separateur.length;
    if (corps.subarray(debut, debut + 2).toString() === '--') break;
    const suivant = corps.indexOf(separateur, debut);
    if (suivant === -1) break;
    const bloc = corps.subarray(debut + 2, suivant - 2);
    const finDesEntetes = bloc.indexOf('\r\n\r\n');
    if (finDesEntetes !== -1) {
      const entetes = bloc.subarray(0, finDesEntetes).toString('utf8');
      const champ = /name="([^"]*)"/.exec(entetes)?.[1] ?? '';
      const fichier = /filename="([^"]*)"/.exec(entetes)?.[1] ?? null;
      const type = /content-type:\s*([^\r\n]+)/i.exec(entetes)?.[1]?.trim() ?? 'application/octet-stream';
      parties.push({ champ, fichier, type, octets: Buffer.from(bloc.subarray(finDesEntetes + 4)) });
    }
    depart = suivant;
  }
  return parties;
};

/** `MessageAttachment` tel que la liste et `message:new` le servent — ce que `lib/api/fil.ts` › `piece` lit. */
export const attachmentServi = (piece: PieceDeBouchon) => ({
  id: piece.id,
  fileUrl: piece.fileUrl,
  originalName: piece.originalName,
  fileName: piece.originalName,
  mimeType: piece.mimeType,
  fileSize: piece.fileSize,
  width: null,
  height: null,
  duration: piece.duration ?? null,
  thumbnailUrl: null,
  createdAt: new Date().toISOString(),
});

export const routesDuFil = (etat: EtatDuFilDeBouchon) => {
  const cidsVus = new Map<string, string>();
  return async ({
    requete,
    reponse,
    url,
    corps,
    json,
    erreur,
  }: {
    readonly requete: IncomingMessage;
    readonly reponse: ServerResponse;
    readonly url: URL;
    readonly corps: Buffer;
    readonly json: Reponse;
    readonly erreur: (statut: number, code: string, message: string, extra?: Record<string, unknown>) => void;
  }): Promise<boolean> => {
    const methode = requete.method ?? 'GET';
    const lisLeCorps = (): Record<string, unknown> => {
      try {
        return objet(JSON.parse(corps.toString('utf8')));
      } catch {
        return {};
      }
    };

    /**
     * `refreshGuestSession` (`link-admission.ts:484-509`), dans son ORDRE : la
     * place (`isActive` ⇒ 401) → le lien (`isActive` ⇒ `link-gone`, 410
     * `LINK_DEACTIVATED`) → `expiresAt` (410 `LINK_EXPIRED`) → la conversation
     * close (410 `CONVERSATION_CLOSED`). JAMAIS `maxUses` : un lien plein garde
     * ses places — c'est la LISTE qui les ferme (`serveurs.ts`).
     */
    const battement = (session: string | null): void => {
      if (session === null || !etat.placesActives.has(session)) {
        erreur(401, 'UNAUTHORIZED', 'Session invalide ou expirée');
        return;
      }
      if (!etat.lien.actif) {
        erreur(410, 'LINK_DEACTIVATED', 'Le lien a été désactivé');
        return;
      }
      if (etat.lien.expireA !== null && Date.parse(etat.lien.expireA) < Date.now()) {
        erreur(410, 'LINK_EXPIRED', 'Le lien a expiré');
        return;
      }
      if (etat.lien.conversationClose) {
        erreur(410, 'CONVERSATION_CLOSED', 'Cette conversation est terminée');
        return;
      }
      json(chargeDeSession(etat));
    };

    if (url.pathname === '/api/v1/guest-sessions/me' && methode === 'PATCH') {
      const session = requete.headers['x-session-token'];
      if (typeof session !== 'string' || session.trim() === '') {
        erreur(400, 'BAD_REQUEST', 'Session token requis');
        return true;
      }
      battement(session.trim());
      return true;
    }

    if (url.pathname === '/api/v1/anonymous/refresh' && methode === 'POST') {
      const session = lisLeCorps().sessionToken;
      battement(typeof session === 'string' ? session : null);
      return true;
    }

    if (url.pathname === '/api/v1/sync') {
      const identite = etat.creanceDe(requete);
      if (identite === null) {
        json({ success: false, error: { code: 'AUTH_REQUIRED', message: 'Authentication required' } }, 401);
        return true;
      }
      const since = Date.parse(url.searchParams.get('since') ?? '') || 0;
      const seqBrut = url.searchParams.get('seq');
      const seq = seqBrut === null ? undefined : Number(seqBrut);
      const checkpointSeq = identite.genre === 'invite' ? 0 : etat.sync.curseur;
      const hasGap = seq !== undefined && Number.isFinite(seq) && seq < checkpointSeq - SEUIL_DE_TROU;
      const demandees = (url.searchParams.get('collections') ?? 'messages').split(',');
      const added = hasGap || !demandees.includes('messages') ? [] : etat.messages().filter((m) => Date.parse(m.createdAt) > since);
      /**
       * La collection `conversations` (`routes/sync/conversations.ts`), celle
       * que `/chats` demande : le CADRE d'une ligne, jamais son contenu. Le
       * bouchon la rend VIDE tant qu'aucun spec n'a fait bouger une
       * conversation — c'est ce qui rend le 304 possible.
       */
      const conversations = demandees.includes('conversations') ? etat.sync.conversations : [];
      /**
       * L'ETAG ET LE 304 (`routes/sync/index.ts:422-449`) : le validateur est
       * calculé sur les COLLECTIONS et la projection, JAMAIS sur `checkpoint`
       * (une horloge murale rendrait tout 304 impossible). Un client qui
       * renvoie `If-None-Match` sur une fenêtre inchangée reçoit 304 SANS corps
       * — c'est ce que le retour de focus de `/chats` doit mesurer.
       */
      const validateur = `W/"${Buffer.from(JSON.stringify({ added, conversations, hasGap, demandees })).length}-${added.length}-${conversations.length}-${hasGap ? 1 : 0}"`;
      reponse.setHeader('etag', validateur);
      // `Cache-Control: no-store` (`routes/sync/index.ts:446`, décision #5015 —
      // charge PRIVÉE, `If-None-Match` explicite reste possible sans lui) :
      // le bouchon reproduit la passerelle TELLE QU'ELLE EST. `ETag` est
      // désormais LISIBLE d'une autre origine (`access-control-expose-headers`,
      // posé une fois pour toute réponse dans `serveurs.ts`, #5015) — un client
      // d'une autre origine peut donc composer `If-None-Match` et recevoir 304.
      reponse.setHeader('cache-control', 'no-store');
      if (String(requete.headers['if-none-match'] ?? '') === validateur) {
        reponse.writeHead(304);
        reponse.end();
        return true;
      }

      json({
        success: true,
        data: {
          checkpoint: new Date().toISOString(),
          checkpointSeq,
          collections: {
            messages: { added, modified: [], deleted: [], truncated: false, nextCursor: null },
            ...(demandees.includes('conversations')
              ? { conversations: { added: conversations, modified: [], deleted: [], truncated: false, nextCursor: null } }
              : {}),
          },
          hasMore: false,
          nextCursor: null,
          hasGap,
          gapAction: hasGap ? 'full_resync_required' : null,
        },
      });
      return true;
    }

    if (url.pathname === '/api/v1/attachments/upload' && methode === 'POST') {
      const identite = etat.creanceDe(requete);
      if (identite === null) {
        erreur(401, 'UNAUTHORIZED', 'Authentication required');
        return true;
      }
      const fichiers = partiesMultipart(corps, String(requete.headers['content-type'] ?? '')).filter((p) => p.fichier !== null);
      if (fichiers.length === 0) {
        erreur(400, 'BAD_REQUEST', 'No files provided');
        return true;
      }
      if (identite.genre === 'invite') {
        // `classifyAnonymousAttachment` (`services/attachments/ContentSignature.ts:255-281`) sur le LIEN VIVANT
        // (`upload.ts:301-311` relit `allowAnonymousFiles` / `allowAnonymousImages`) — jamais l'instantané du join.
        // UN VOCAL EST TOUJOURS ADMIS (`:266-269`, décision produit — #5061 § 2.3) : ni
        // `allowAnonymousFiles` ni `allowAnonymousImages` ne le gouvernent.
        const { lien } = etat.invite.place;
        const refuse = fichiers.find(
          (f) => !f.type.startsWith('audio/') && (f.type.startsWith('image/') ? !lien.allowAnonymousImages : !lien.allowAnonymousFiles),
        );
        if (refuse !== undefined) {
          erreur(
            403,
            'FORBIDDEN',
            refuse.type.startsWith('image/')
              ? 'Images are not allowed for anonymous users on this conversation'
              : 'File uploads are not allowed for anonymous users on this conversation',
          );
          return true;
        }
      }
      const attachments = fichiers.map((f) => {
        const id = `a${etat.identifiants.suivant().slice(1)}`;
        const nom = f.fichier ?? 'piece';
        const piece: PieceDeBouchon = {
          id,
          fileUrl: `/api/v1/attachments/file/${id}/${encodeURIComponent(nom)}`,
          originalName: nom,
          mimeType: f.type,
          fileSize: f.octets.length,
          octets: f.octets,
        };
        etat.pieces.set(id, piece);
        return attachmentServi(piece);
      });
      json({ success: true, data: { attachments } });
      return true;
    }

    const fichier = /^\/api\/v1\/attachments\/file\/([^/]+)\//.exec(url.pathname);
    if (fichier !== null && methode === 'GET') {
      const piece = etat.pieces.get(fichier[1] ?? '');
      if (piece === undefined) {
        erreur(404, 'NOT_FOUND', 'File not found');
        return true;
      }
      reponse.writeHead(200, { 'content-type': piece.mimeType, 'content-length': String(piece.fileSize) });
      reponse.end(piece.octets);
      return true;
    }

    const accuses = /^\/api\/v1\/conversations\/([^/?]+)\/receipts$/.exec(url.pathname);
    if (accuses !== null && methode === 'POST') {
      const identite = etat.creanceDe(requete);
      if (identite === null) {
        erreur(401, 'UNAUTHORIZED', 'Authentication required');
        return true;
      }
      const lu = lisLeCorps();
      if (lu.type !== 'read' && lu.type !== 'delivered') {
        erreur(400, 'BAD_REQUEST', 'type invalide');
        return true;
      }
      const ids = Array.isArray(lu.messageIds) ? lu.messageIds.filter((id): id is string => typeof id === 'string') : [];
      const connus = new Set(etat.messages().map((m) => m.id));
      json({ success: true, data: { type: lu.type, markedCount: ids.filter((id) => connus.has(id)).length, unreadCount: 0 } });
      return true;
    }

    if (url.pathname === '/api/v1/reactions' && methode === 'POST') {
      const identite = etat.creanceDe(requete);
      if (identite === null) {
        erreur(401, 'UNAUTHORIZED', 'Authentication required');
        return true;
      }
      const lu = lisLeCorps();
      const messageId = typeof lu.messageId === 'string' ? lu.messageId : '';
      const emoji = typeof lu.emoji === 'string' ? lu.emoji : '';
      if (messageId === '' || emoji === '') {
        erreur(400, 'BAD_REQUEST', 'messageId et emoji requis');
        return true;
      }
      const change = etat.reactions.ajoute(messageId, emoji, participantDe(identite));
      const reaction = { id: `r-${messageId}-${emoji}`, messageId, emoji, participantId: participantDe(identite), createdAt: new Date().toISOString() };
      if (change) {
        etat.socket().diffuseLaReaction(
          etat.conversationId,
          'add',
          evenementDeReaction({ magasin: etat.reactions, messageId, conversationId: etat.conversationId, emoji, action: 'add', acteur: identite }),
        );
      }
      json({ success: true, data: reaction }, change ? 201 : 200);
      return true;
    }

    const retrait = /^\/api\/v1\/reactions\/([^/]+)\/([^/]+)$/.exec(url.pathname);
    if (retrait !== null && methode === 'DELETE') {
      const identite = etat.creanceDe(requete);
      if (identite === null) {
        erreur(401, 'UNAUTHORIZED', 'Authentication required');
        return true;
      }
      const messageId = decodeURIComponent(retrait[1] ?? '');
      const emoji = decodeURIComponent(retrait[2] ?? '');
      const change = etat.reactions.retire(messageId, emoji, participantDe(identite));
      if (change) {
        etat.socket().diffuseLaReaction(
          etat.conversationId,
          'remove',
          evenementDeReaction({ magasin: etat.reactions, messageId, conversationId: etat.conversationId, emoji, action: 'remove', acteur: identite }),
        );
      }
      json({ success: true, data: change ? { message: 'Reaction removed' } : { message: 'Reaction already absent' } });
      return true;
    }

    /**
     * `PUT` / `DELETE /api/v1/messages/:messageId` (issue #5163) —
     * `routes/messages-writes.ts:127,428`, `requiredAuth` avec
     * `allowAnonymous: false` : un INVITÉ y est toujours 401, jamais un refus
     * de saisie ou d'autorisation qui laisserait croire que la route existe
     * pour lui. Les phrases sont EXACTES, relues dans la passerelle.
     */
    const unMessage = /^\/api\/v1\/messages\/([^/?]+)$/.exec(url.pathname);
    if (unMessage !== null && (methode === 'PUT' || methode === 'DELETE')) {
      const identite = etat.creanceDe(requete);
      if (identite === null || identite.genre === 'invite') {
        erreur(401, 'UNAUTHORIZED', 'Authentication required');
        return true;
      }
      const messageId = decodeURIComponent(unMessage[1] ?? '');
      if (methode === 'DELETE') {
        const retire = etat.retireUnMessage(messageId);
        if (retire === null) {
          erreur(404, 'NOT_FOUND', 'Message non trouvé');
          return true;
        }
        etat.socket().emets(etat.conversationId, 'message:deleted', { messageId, conversationId: etat.conversationId });
        json({ success: true, data: { message: 'Message supprimé avec succès' } });
        return true;
      }
      const lu = lisLeCorps();
      const content = typeof lu.content === 'string' ? lu.content : undefined;
      const piecesDeLaCible = etat.messages().find((m) => m.id === messageId)?.attachments;
      // `admitEditedContent` n'accepte le vide que si le message PORTE des
      // pièces (`messageEditContent.ts`) : un tableau VIDE n'en est pas une.
      if (content !== undefined && content.trim() === '' && !(Array.isArray(piecesDeLaCible) && piecesDeLaCible.length > 0)) {
        erreur(400, 'VALIDATION', 'Message content cannot be empty (unless attachments are included)');
        return true;
      }
      const edite = content === undefined ? null : etat.modifieUnMessage(messageId, content);
      if (edite === null) {
        erreur(404, 'NOT_FOUND', 'Message not found or you are not authorized to modify it');
        return true;
      }
      etat.socket().emets(etat.conversationId, 'message:edited', edite);
      json({ success: true, data: { ...edite, message: 'Message modifié avec succès' } });
      return true;
    }

    /**
     * Le fil — `GET /conversations/:id`, `GET` / `POST /conversations/:id/messages`
     * (doc-tête). `cidsVus` est la déduplication par `clientMessageId` de la
     * passerelle (§ 6.2 de la phase 4) : une clé revue rend le message déjà
     * persisté, `isDuplicate: true`.
     *
     * `search` EST EXCLU DU PARAMÈTRE, et ce n'est pas un cas particulier : le
     * routeur radix de Fastify donne la priorité à un segment STATIQUE sur un
     * segment paramétrique, si bien que `GET /conversations/search`
     * (`routes/conversations/search.ts:67`) l'emporte toujours sur
     * `GET /conversations/:id`. Une expression rationnelle, elle, n'a pas cette
     * priorité — elle prenait donc `search` pour un identifiant et servait un
     * fil là où la production sert des résultats.
     *
     * C'est la faute que le dépôt nomme « un double de test ment aussi par ce
     * qu'il ACCEPTE » : ce bouchon acceptait un identifiant que la passerelle
     * n'accepte pas, et le témoin de la recherche tombait en accusant l'écran.
     * Un identifiant de conversation est un ObjectId ; `search` n'en est pas
     * un, et aucune route ne le lira jamais comme tel.
     */
    const fil = /^\/api\/v1\/conversations\/(?!search(?:$|[/?]))([^/?]+)(\/messages)?$/.exec(
      url.pathname,
    );
    if (fil === null) return false;
    const identite = etat.creanceDe(requete);
    if (identite === null) {
      erreur(401, 'UNAUTHORIZED', 'Authentification requise');
      return true;
    }
    // Une conversation ANNEXE se lit par son identifiant, comme la passerelle le
    // fait — et seulement en lecture : elle n'a ni lien, ni place, ni socket.
    const annexe = etat.filsAnnexes.get(fil[1] ?? '');
    if (annexe !== undefined && methode === 'GET') {
      const tri = [...annexe.messages].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
      json(
        fil[2] === undefined
          ? { success: true, data: { id: annexe.id, identifier: annexe.id, title: annexe.titre, type: 'group', memberCount: annexe.membres, participants: [], unreadCount: 0 } }
          : {
              success: true,
              data: tri,
              pagination: { total: tri.length, offset: 0, limit: tri.length, hasMore: false },
              cursorPagination: { limit: tri.length, hasMore: false, nextCursor: null },
            },
      );
      return true;
    }
    // `messages-list.ts:270-278` — la ligne du LIEN du participant ferme la
    // lecture : échu ⇒ 403 `SHARE_LINK_EXPIRED`, plein (`currentUses >=
    // maxUses`, le DERNIER admis compris) ⇒ 403 `SHARE_LINK_MAX_USES`. Cette
    // route ne lit PAS `isActive` (gagé : `messages-routes.test.ts:854-885`) :
    // un lien fermé se dit au battement, jamais ici. Le code voyage dans
    // `code` (`sendForbidden(reply, message, { code })`).
    if (identite.genre === 'invite' && fil[2] !== undefined) {
      if (etat.lien.expireA !== null && Date.parse(etat.lien.expireA) < Date.now()) {
        erreur(403, 'This share link has expired', 'This share link has expired', { code: 'SHARE_LINK_EXPIRED' });
        return true;
      }
      if (etat.lien.maxUses !== null && etat.lien.currentUses >= etat.lien.maxUses) {
        erreur(403, 'This share link has reached its usage limit', 'This share link has reached its usage limit', { code: 'SHARE_LINK_MAX_USES' });
        return true;
      }
    }
    if (fil[2] === undefined) {
      json({
        success: true,
        data: {
          id: etat.conversationId,
          identifier: 'lagos',
          title: etat.titre,
          type: 'group',
          memberCount: etat.membres,
          // `core-detail.ts:231-236` : `isOnline` n'est servi qu'à qui a le droit de le voir
          // (`presenceFor`) — le membre, ami des deux pairs ; l'invité, sans amitié, lit `false`.
          participants: [...etat.presences].map(([userId, isOnline]) => ({ userId, isOnline: identite.genre === 'membre' && isOnline })),
          unreadCount: 0,
        },
      });
      return true;
    }
    if (methode === 'POST') {
      const corpsLu = lisLeCorps();
      const content = typeof corpsLu.content === 'string' ? corpsLu.content : '';
      // `SendMessageBodySchema` (`messages-send.ts:41-48`) : `.max(MAX_MESSAGE_LENGTH, phrase)`, refusé par
      // `sendBadRequest(reply, 'Validation error', { message: bodyResult.error.message })` (`:194-196`) —
      // `error.message` de Zod est la liste JSON des violations, la phrase française dedans.
      if (content.length > LONGUEUR_MAX_DU_CONTENU) {
        erreur(400, 'Validation error', JSON.stringify([{ origin: 'string', code: 'too_big', maximum: LONGUEUR_MAX_DU_CONTENU, inclusive: true, path: ['content'], message: PHRASE_DU_CONTENU_TROP_LONG }]));
        return true;
      }
      // `attachmentIds` — des pièces PRÉ-TÉLÉVERSÉES (`messages-send.ts:76`) ; un
      // message sans texte mais avec une pièce n'est pas vide (`:92-98`).
      const attachmentIds = Array.isArray(corpsLu.attachmentIds) ? corpsLu.attachmentIds.filter((id): id is string => typeof id === 'string') : [];
      // UN LIEU PARTAGÉ SEUL n'est pas un message vide (#5061, § 2.1 —
      // `.refine()` de `SendMessageBodySchema` admet `Boolean(data.location)`).
      const location = lieuValide(corpsLu.location);
      if (content.trim() === '' && attachmentIds.length === 0 && location === null) {
        erreur(400, 'VALIDATION', 'Le message ne peut pas être vide');
        return true;
      }
      const inconnue = attachmentIds.find((id) => !etat.pieces.has(id));
      if (inconnue !== undefined) {
        erreur(400, 'VALIDATION', `Attachment ${inconnue} invalid`);
        return true;
      }
      const cid = typeof corpsLu.clientMessageId === 'string' ? corpsLu.clientMessageId : null;
      const deja = cid === null ? undefined : cidsVus.get(cid);
      if (deja !== undefined) {
        json({ success: true, data: { ...etat.messages().find((m) => m.id === deja), isDuplicate: true } });
        return true;
      }
      // `replyToId` (issue #5163, `messages-send.ts:60`) — résolu contre ce
      // qui est déjà servi, comme la passerelle le referme (`messageNewPayload.ts:164-176`).
      const replyToId = typeof corpsLu.replyToId === 'string' ? corpsLu.replyToId : undefined;
      const cible = replyToId === undefined ? undefined : etat.messages().find((m) => m.id === replyToId);
      const message = chargeDeMessage({
        id: etat.identifiants.suivant(),
        conversationId: etat.conversationId,
        senderId: identite.id,
        content,
        originalLanguage: typeof corpsLu.originalLanguage === 'string' ? corpsLu.originalLanguage : 'fr',
        clientMessageId: cid ?? undefined,
        sender:
          identite.genre === 'invite'
            ? { id: INVITE.id, displayName: etat.invite.nom, type: 'anonymous' }
            : { id: PARTICIPANT_DU_MEMBRE, displayName: MEMBRE.nom, userId: MEMBRE.id },
        attachments: attachmentIds.map((id) => attachmentServi(etat.pieces.get(id) as PieceDeBouchon)),
        ...(cible === undefined ? {} : { replyToId, replyTo: cible }),
        ...(location === null ? {} : { location }),
      });
      if (cid !== null) cidsVus.set(cid, message.id);
      etat.ajouteUnMessage({ ...message, senderParticipantId: identite.genre === 'invite' ? INVITE.id : PARTICIPANT_DU_MEMBRE });
      // Comme `MeeshySocketIOManager.ts:3042-3056` : l'identité client à la
      // room du COMPTE de l'expéditeur, la charge nue au reste — et à tous
      // quand l'expéditeur est anonyme.
      etat.socket().diffuseLeMessage(etat.conversationId, message, identite);
      json({ success: true, data: message });
      return true;
    }
    const messages = etat.messages();
    const limite = Math.min(50, Number(url.searchParams.get('limit') ?? '20') || 20);
    const before = url.searchParams.get('before');
    const around = url.searchParams.get('around');
    const tri = [...messages].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    const borne = before === null ? undefined : messages.find((m) => m.id === before);
    /**
     * LA FENÊTRE `around`, comme la passerelle la construit
     * (`routes/conversations/messages-list.ts:400-450`) : la MOITIÉ des places
     * en messages plus anciens, la cible, la moitié en plus récents — et non la
     * seule cible, ce que ce bouchon rendait. Un bouchon qui sert moins que la
     * passerelle fait passer pour vert un écran qui, en production, n'aurait pas
     * ses voisins.
     */
    const moitie = Math.floor(limite / 2);
    const rang = around === null ? -1 : tri.findIndex((m) => m.id === around);
    const page = (
      rang >= 0
        ? tri.slice(Math.max(0, rang - moitie), rang + moitie + 1)
        : tri.filter((m) => borne === undefined || Date.parse(m.createdAt) < Date.parse(borne.createdAt)).slice(0, limite)
    ).slice(0, limite);
    const dernier = page[page.length - 1];
    // « des messages PLUS ANCIENS existent » — ce que le schéma de la passerelle
    // déclare pour `hasMore` dans les deux modes reculants (`before` et
    // `around`), et non « la page est pleine ».
    const plusVieux = dernier !== undefined && tri.some((m) => Date.parse(m.createdAt) < Date.parse(dernier.createdAt));
    json({
      success: true,
      // `reactionSummary` — `emoji → compte`, calculé à la lecture (`ReactionService.getEmojiAggregation`).
      data: page.map((m) => ({ ...m, reactionSummary: etat.reactions.resume(m.id) })),
      pagination: { total: messages.length, offset: 0, limit: limite, hasMore: false },
      cursorPagination: {
        limit: limite,
        hasMore: rang >= 0 ? plusVieux : page.length === limite && tri.length > limite,
        nextCursor: dernier === undefined ? null : dernier.id,
      },
    });
    return true;
  };
};
