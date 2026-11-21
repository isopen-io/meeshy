/**
 * Écrire les MÉTADONNÉES d'une conversation, et l'annoncer — le site unique
 * que partagent la route de MEMBRE (`PUT|PATCH /conversations/:id`,
 * `core-lifecycle.ts`) et la route SOUVERAINE
 * (`PATCH /admin/conversations/:id`, `conversation-settings-sovereign.ts`).
 *
 * Extrait par #7845, en DÉPLACEMENT : aucune règle de la route de membre n'a
 * bougé. La raison de l'extraction est la seconde porte — un administrateur
 * qui configure une conversation dont il n'est pas membre. Deux compositions
 * écrites séparément divergeraient au premier réglage ajouté, et c'est
 * exactement ce qu'avait produit le jumeau supprimé de `sharing.ts` : un
 * contrat qui acceptait `avatar` sans l'écrire.
 *
 * Ce qui reste AUX ROUTES, parce que c'est là que la question se pose : QUI a
 * le droit (le rang dans la conversation pour l'une, le rang d'administration
 * pour l'autre), et ce qu'on refuse selon le type du conteneur.
 */
import type { ConversationUpdatedEventData } from '@meeshy/shared/types/socketio-events';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import {
  emitToConversationParticipants,
  type ConversationRoomEmitter,
  type ParticipantRoomTarget,
} from '../../socketio/emitToConversationParticipants';
import { participationEstVivante } from '../../routes/conversations/utils/access-control';
import { SecuritySanitizer } from '../../utils/sanitize.js';

/**
 * Les huit réglages que `conversation:updated` peut annoncer, DÉRIVÉS du
 * contrat plutôt que redéclarés : un neuvième réglage ajouté ici ne compile
 * pas tant qu'il n'est pas déclaré sur `ConversationUpdatedEventData`.
 *
 * Une clé ABSENTE veut dire « ce réglage n'a pas bougé », jamais « remets-le à
 * zéro » — d'où la composition par spreads conditionnels.
 */
export type ConversationMetadataChanges = Partial<Pick<
  ConversationUpdatedEventData,
  'title' | 'description' | 'avatar' | 'banner' | 'defaultWriteRole'
  | 'isAnnouncementChannel' | 'slowModeSeconds' | 'autoTranslateEnabled'
>>;

/** Le corps tel que les deux routes le reçoivent — tous les champs facultatifs. */
export type ConversationMetadataBody = {
  readonly title?: string;
  readonly description?: string;
  readonly avatar?: string | null;
  readonly banner?: string | null;
  readonly defaultWriteRole?: string;
  readonly isAnnouncementChannel?: boolean;
  readonly slowModeSeconds?: number;
  readonly autoTranslateEnabled?: boolean;
};

/**
 * Ce que le corps demande d'écrire (`updateData`) et ce que l'annonce dira
 * (`changedFields`). Aujourd'hui les deux coïncident ; ils sont rendus
 * séparément parce qu'ils ne répondent pas à la même question — l'un parle à
 * Prisma, l'autre au contrat temps réel — et qu'un réglage écrit sans être
 * annonçable (ou l'inverse) doit pouvoir se dire sans réécrire les appelants.
 *
 * `title` et `description` sont ASSAINIS ici (XSS) : c'est la valeur assainie
 * qui s'écrit ET qui s'annonce, jamais la brute.
 */
export function composeConversationUpdate(body: ConversationMetadataBody): {
  readonly updateData: ConversationMetadataChanges;
  readonly changedFields: ConversationMetadataChanges;
} {
  const title = body.title !== undefined ? SecuritySanitizer.sanitizeText(body.title) : undefined;
  const description = body.description !== undefined ? SecuritySanitizer.sanitizeText(body.description) : undefined;

  const changes: ConversationMetadataChanges = {
    ...(title !== undefined && { title }),
    ...(description !== undefined && { description }),
    ...(body.avatar !== undefined && { avatar: body.avatar }),
    ...(body.banner !== undefined && { banner: body.banner }),
    ...(body.defaultWriteRole !== undefined && { defaultWriteRole: body.defaultWriteRole }),
    ...(body.isAnnouncementChannel !== undefined && { isAnnouncementChannel: body.isAnnouncementChannel }),
    ...(body.slowModeSeconds !== undefined && { slowModeSeconds: body.slowModeSeconds }),
    ...(body.autoTranslateEnabled !== undefined && { autoTranslateEnabled: body.autoTranslateEnabled }),
  };

  return { updateData: { ...changes }, changedFields: { ...changes } };
}

/**
 * Annonce `conversation:updated` aux participants dont la participation est
 * VIVANTE : la room de conversation ET la room personnelle de chacun — un
 * membre posé sur l'écran de LISTE a quitté la room du fil, et ne verrait
 * sinon ni le renommage ni la nouvelle image avant un rechargement.
 * `emitToConversationParticipants` chaîne les rooms (une copie par socket) et
 * nomme la room d'un participant sans compte par son `Participant.id`.
 *
 * AUCUNE clé `lastMessage*` : le tri-état client distingue « clé absente »
 * (cet événement ne parle pas du dernier message) de « clé nulle » (la carte
 * du Prisme est périmée).
 *
 * ── POURQUOI LA LOI ENTIÈRE, ET PAS `isActive` NU (#20103) ──────────────────
 *
 * C'est le site qui DÉCIDE pour ses deux appelants, et la décision se lit sur
 * ce que la charge TRANSPORTE : `conversation:updated` porte le TITRE, la
 * description, l'avatar et la bannière. Du CONTENU — pas une rétractation.
 *
 * Un membre actif-et-BANNI n'a accès ni à la room du fil ni à son REST : lui
 * servir le nouveau titre lui rend un contenu qu'aucune autre porte ne lui
 * donne. C'est mot pour mot la fuite que #20110 a fermée sur la charge
 * d'ARRIVÉE d'un groupe, rejouée ici sur le RENOMMAGE — et elle était
 * invisible des deux côtés : la projection des appelants n'a aucun `where`
 * (donc aucun cliquet de clause ne la voit) et le filtre vivait ici, en code,
 * sur `isActive` nu.
 *
 * **Les annonces de CLÔTURE font l'inverse, et c'est écrit sur leurs sites**
 * (`leave.ts`, `delete-for-me.ts`, `core-lifecycle.ts`,
 * `obsoleteConversation.ts`) : `conversation:closed` ne porte aucun contenu et
 * RETRACTE une ligne. La retenir à un banni lui laisserait un fil fantôme dans
 * sa liste, donc son audience reste `isActive` nu, volontairement plus large.
 *
 * ── ET POURQUOI `bannedAt` EST DANS LE TYPE ────────────────────────────────
 *
 * `participationEstVivante` juge une ligne DÉJÀ lue : un champ non PROJETÉ
 * vaut `undefined`, et `undefined == null` est VRAI — la garde rendrait donc
 * `true` pour un banni, sans qu'aucun témoin de garde ne puisse le voir
 * (#20136). Exiger la colonne dans la SIGNATURE met le compilateur sur la
 * projection de chaque appelant : c'est la seule garde qui ne peut pas être
 * oubliée en silence. `Date | null | undefined` est admis parce que la colonne
 * est ABSENTE du document de tout participant jamais banni ; ce qui est
 * interdit, c'est de ne pas la demander.
 */
export function broadcastConversationUpdated(params: {
  readonly io: ConversationRoomEmitter | null | undefined;
  readonly conversationId: string;
  readonly participants: ReadonlyArray<
    ParticipantRoomTarget & { readonly isActive: boolean; readonly bannedAt: Date | null | undefined }
  >;
  readonly changedFields: ConversationMetadataChanges;
  readonly updatedBy: string;
}): void {
  const { io, conversationId, participants, changedFields, updatedBy } = params;
  if (!io) return;
  emitToConversationParticipants({
    io,
    conversationId,
    participants: participants.filter((p) => participationEstVivante(p)),
    event: SERVER_EVENTS.CONVERSATION_UPDATED,
    payload: {
      conversationId,
      ...changedFields,
      updatedBy: { id: updatedBy },
      updatedAt: new Date().toISOString(),
    },
  });
}
