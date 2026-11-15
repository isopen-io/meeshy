/**
 * Qui a le droit de faire de ses adresses des liens SUIVIS (#10286).
 *
 * Un lien suivi est une adresse que Meeshy REPREND à son compte : `<url>`
 * devient `m+<token>`, une URL brute reçoit un token rangé dans
 * `metadata.trackingLinks`, et le client la sert sous le domaine Meeshy
 * (`/l/<token>`), cliquable, en carte ou en aperçu. Pour un invité ANONYME —
 * entré par un lien de partage, sans compte — c'est blanchir n'importe quelle
 * adresse sous notre domaine : un vecteur de hameçonnage et de spam.
 *
 * La loi : seul un expéditeur dont on PROUVE qu'il est un compte inscrit voit
 * ses adresses suivies. Un anonyme, un participant introuvable, une lecture qui
 * échoue ⇒ texte laissé tel qu'écrit, aucun `TrackingLink`, aucune carte.
 * Fail-closed : l'absence de preuve ne suit rien.
 *
 * Le `User.id` porté par la variante suivie est aussi le PROPRIÉTAIRE du lien
 * (`TrackingLink.createdBy`) — la même lecture répond aux deux questions.
 */
export type LinkTrackingAuthor =
  | { readonly tracked: true; readonly userId: string }
  | { readonly tracked: false };

export const UNTRACKED_LINK_AUTHOR: LinkTrackingAuthor = { tracked: false };

/**
 * Ce que la loi lit d'un participant expéditeur — `type` quand on l'a, et le
 * compte par la colonne `userId` OU la relation `user` chargée (certaines
 * lectures, comme celle du lien de partage, ne chargent que la seconde).
 */
export interface LinkSenderFacts {
  readonly type?: string | null;
  readonly userId?: string | null;
  readonly user?: { readonly id?: string | null } | null;
}

export function linkTrackingAuthorOf(sender: LinkSenderFacts | null | undefined): LinkTrackingAuthor {
  if (!sender) return UNTRACKED_LINK_AUTHOR;
  if (sender.type === 'anonymous') return UNTRACKED_LINK_AUTHOR;
  const userId = sender.userId ?? sender.user?.id;
  if (typeof userId !== 'string' || userId.length === 0) return UNTRACKED_LINK_AUTHOR;
  return { tracked: true, userId };
}

/**
 * La LECTURE de la même loi, pour les messages écrits AVANT elle : un message
 * d'expéditeur non suivi ne sert pas sa carte `metadata.trackingLinks`, quel
 * que soit ce que la base en garde. Le reste de `metadata` (lieu, sticker,
 * citation de post…) sort intact ; un `metadata` réduit à rien sort `null`.
 *
 * `sender` est le participant tel que la lecture l'a chargé — `type` et/ou
 * `userId`. Absent ⇒ non suivi.
 */
export function servedLinkMetadata<T>(metadata: T, sender: LinkSenderFacts | null | undefined): T | null {
  if (linkTrackingAuthorOf(sender).tracked) return metadata;
  if (metadata === null || typeof metadata !== 'object' || Array.isArray(metadata)) return metadata;
  if (!('trackingLinks' in metadata)) return metadata;
  const { trackingLinks: _withheld, ...rest } = metadata as Record<string, unknown>;
  return Object.keys(rest).length > 0 ? (rest as T) : null;
}
