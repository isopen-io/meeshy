import { type AdminDeps, asRecord, asText } from './admin';
import { MOTIF_LONGUEUR_MINIMALE } from './admin-conversations';
import { type AdminConversation, decodeAdminConversation } from './admin-user-conversations';
import type { ApiResult } from './http';

/**
 * **CONFIGURER UNE CONVERSATION SANS EN ÊTRE MEMBRE** (#7845 E1–E3) — les trois
 * écritures souveraines, sous `canManageConversations` ET le rang ADMIN
 * (`requireAdminRank`, qui écarte MODERATOR) :
 *
 * | geste | adresse |
 * |---|---|
 * | E1 — titre, description, images, droits d'écriture, archivage, fermeture | `PATCH /admin/conversations/:id` |
 * | E2 — rôle d'un participant | `PATCH /admin/conversations/:id/participants/:userId` |
 * | E3 — retrait d'un participant | `POST /admin/conversations/:id/participants/:userId/remove` |
 *
 * Les routes de membre (`PUT|PATCH /conversations/:id`) exigent que l'acteur
 * soit DANS la conversation ; un administrateur qui instruit une plainte n'y est
 * pas. Ces trois portes-ci ne le demandent pas — en échange, chaque geste porte
 * un MOTIF écrit, journalisé par `withAudit`.
 *
 * ## Le motif se refuse ICI quand il est trop court
 *
 * Le schéma de la passerelle refuse en 400 sous {@link MOTIF_LONGUEUR_MINIMALE}
 * caractères et au-delà de cinq cents. Un refus certain d'avance ne mérite pas
 * un aller-retour : `status: 0`, la convention du port pour « refusé sans avoir
 * parlé au serveur ».
 *
 * ## Ce que ce module ne fait PAS
 *
 * Il ne change ni le `type` ni le mode de chiffrement : la passerelle les refuse
 * en 400 (`propertyNames`), parce que muter l'un ou l'autre déplace des
 * invariants d'admission que rien ne recalcule. Le type
 * {@link AdminConversationEdit} ne les déclare donc pas.
 */
export { MOTIF_LONGUEUR_MINIMALE };

const MOTIF_LONGUEUR_MAXIMALE = 500;

/**
 * La liste blanche de E1. Chaque champ admet `| undefined` EXPLICITEMENT — la
 * forme qu'un formulaire produit pour un champ non touché (même raison que
 * `AdminUserEdit`). `avatar` et `banner` admettent `null`, qui EFFACE l'image ;
 * `undefined`, lui, ne touche à rien.
 */
export type AdminConversationEdit = {
  readonly title?: string | undefined;
  readonly description?: string | undefined;
  readonly avatar?: string | null | undefined;
  readonly banner?: string | null | undefined;
  readonly defaultWriteRole?: 'everyone' | 'member' | 'moderator' | 'admin' | 'creator' | undefined;
  readonly isAnnouncementChannel?: boolean | undefined;
  readonly slowModeSeconds?: number | undefined;
  readonly autoTranslateEnabled?: boolean | undefined;
  /** `false` ARCHIVE, `true` RESTAURE. */
  readonly isActive?: boolean | undefined;
  /** `true` FERME à l'écriture (et désactive ses liens de partage), `false` rouvre. */
  readonly closed?: boolean | undefined;
};

export type AdminParticipantRole = 'admin' | 'moderator' | 'member';

export type AdminMemberRoleChange = {
  readonly conversationId: string;
  readonly userId: string;
  readonly participantId: string;
  readonly role: string;
};

export type AdminMemberRemoval = {
  readonly conversationId: string;
  readonly userId: string;
  readonly participantId: string;
  readonly removed: boolean;
};

type MotifVerifie = { readonly ok: true; readonly motif: string } | { readonly ok: false; readonly status: 0; readonly error: string };

function verifierMotif(reason: string): MotifVerifie {
  const motif = reason.trim();
  if (motif.length < MOTIF_LONGUEUR_MINIMALE) {
    return { ok: false, status: 0, error: `Le motif doit compter au moins ${MOTIF_LONGUEUR_MINIMALE} caractères` };
  }
  if (motif.length > MOTIF_LONGUEUR_MAXIMALE) {
    return { ok: false, status: 0, error: `Le motif ne peut dépasser ${MOTIF_LONGUEUR_MAXIMALE} caractères` };
  }
  return { ok: true, motif };
}

const cheminConversation = (conversationId: string) => `/api/v1/admin/conversations/${encodeURIComponent(conversationId)}`;

const cheminParticipant = (conversationId: string, userId: string) =>
  `${cheminConversation(conversationId)}/participants/${encodeURIComponent(userId)}`;

/** Les champs PRÉSENTÉS — une valeur `undefined` n'existe pas en JSON. */
export function conversationEditFieldsOf(edit: AdminConversationEdit): readonly (keyof AdminConversationEdit)[] {
  return (Object.keys(edit) as (keyof AdminConversationEdit)[]).filter((champ) => edit[champ] !== undefined);
}

/**
 * E1. La passerelle rend la conversation à jour, dans la MÊME forme qu'une
 * ligne de la liste du membre (sans participants) — d'où le même décodeur.
 */
export async function updateAdminConversation(
  params: AdminDeps & {
    readonly conversationId: string;
    readonly edit: AdminConversationEdit;
    readonly reason: string;
    readonly signal?: AbortSignal;
  },
): Promise<ApiResult<AdminConversation>> {
  const motif = verifierMotif(params.reason);
  if (!motif.ok) return motif;

  const champs = conversationEditFieldsOf(params.edit);
  if (champs.length === 0) return { ok: false, status: 0, error: 'Aucun champ à écrire' };

  const result = await params.transport.request<unknown>({
    method: 'PATCH',
    path: cheminConversation(params.conversationId),
    body: { ...Object.fromEntries(champs.map((champ) => [champ, params.edit[champ]])), reason: motif.motif },
    ...(params.signal === undefined ? {} : { signal: params.signal }),
  });
  if (!result.ok) return result;

  const conversation = decodeAdminConversation(result.data);
  return conversation === null
    ? { ok: false, status: 0, error: 'Conversation illisible' }
    : { ok: true, data: conversation };
}

/** E2. Le créateur est refusé par la passerelle (403 `CREATOR_PROTECTED`). */
export async function setAdminConversationMemberRole(
  params: AdminDeps & {
    readonly conversationId: string;
    readonly userId: string;
    readonly role: AdminParticipantRole;
    readonly reason: string;
    readonly signal?: AbortSignal;
  },
): Promise<ApiResult<AdminMemberRoleChange>> {
  const motif = verifierMotif(params.reason);
  if (!motif.ok) return motif;

  const result = await params.transport.request<unknown>({
    method: 'PATCH',
    path: cheminParticipant(params.conversationId, params.userId),
    body: { role: params.role, reason: motif.motif },
    ...(params.signal === undefined ? {} : { signal: params.signal }),
  });
  if (!result.ok) return result;

  const charge = asRecord(result.data) ?? {};
  return {
    ok: true,
    data: {
      conversationId: asText(charge.conversationId) || params.conversationId,
      userId: asText(charge.userId) || params.userId,
      participantId: asText(charge.participantId),
      role: asText(charge.role) || params.role,
    },
  };
}

/** E3. Le créateur et la conversation globale sont refusés (403). */
export async function removeAdminConversationMember(
  params: AdminDeps & {
    readonly conversationId: string;
    readonly userId: string;
    readonly reason: string;
    readonly signal?: AbortSignal;
  },
): Promise<ApiResult<AdminMemberRemoval>> {
  const motif = verifierMotif(params.reason);
  if (!motif.ok) return motif;

  const result = await params.transport.request<unknown>({
    method: 'POST',
    path: `${cheminParticipant(params.conversationId, params.userId)}/remove`,
    body: { reason: motif.motif },
    ...(params.signal === undefined ? {} : { signal: params.signal }),
  });
  if (!result.ok) return result;

  const charge = asRecord(result.data) ?? {};
  return {
    ok: true,
    data: {
      conversationId: asText(charge.conversationId) || params.conversationId,
      userId: asText(charge.userId) || params.userId,
      participantId: asText(charge.participantId),
      // Un succès HTTP est un retrait ; la charge ne peut que le confirmer.
      removed: charge.removed !== false,
    },
  };
}
