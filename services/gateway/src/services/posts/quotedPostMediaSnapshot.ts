/**
 * LE MÉDIA NOMMÉ D'UN COMMENTAIRE — la forme figée, et la liste de ce qui ne
 * peut PAS l'être (#6578, même arbitrage porteur que #6123/#6164, voie C
 * hybride).
 *
 * Commenter un post à quatre photos ne dit plus seulement « je commente ce
 * post » : on peut viser la DEUXIÈME. Ce que le commentaire GRAVE, il le grave
 * pour toujours — donc il ne grave que ce qui ne peut jamais devenir un
 * secret :
 *
 * | FIGÉ dans `metadata.quotedPostMedia` | RELU à chaque service |
 * |---|---|
 * | `postMediaId` — l'ancre du saut | la vignette / `fileUrl` / le ThumbHash |
 * | `kind` — la NATURE du média | le nom de fichier, la taille |
 * | | la **DURÉE**, la légende, l'alt, la transcription |
 *
 * Le PRÉCÉDENT du dépôt est `protectedPreview()`
 * (`services/notifications/NotificationService.ts`) : d'un contenu protégé, il
 * ne divulgue QUE l'icône de protection et l'icône de TYPE. La nature est donc
 * le seul fait qu'on ait le droit de figer — un média cité devenu secret ou
 * supprimé dit **« une photo »** et rien de plus : la citation ne se vide pas,
 * et elle ne fuit pas.
 *
 * **La liste des champs RÉVOCABLES vit ICI, à côté de la forme**, jamais
 * dispersée chez ses lecteurs : sans ce voisinage, le premier lecteur qui fige
 * un champ de plus le ferait sans qu'aucun témoin tombe. C'est la raison qui a
 * fait naître `ATTACHMENT_REPLY_REVOCABLE_FIELDS` côté conversation, et elle
 * vaut mot pour mot ici.
 *
 * AUCUNE MIGRATION PRISMA : `PostComment.metadata Json?` existe déjà
 * (« parité avec Message.metadata / Post.metadata »), et le même champ porte
 * déjà `trackingLinks` et `location`.
 */
import { attachmentReplyKindFor, type AttachmentReplyKind } from '../messaging/attachmentReplySnapshot';

/**
 * La NATURE du média cité. **Le MÊME vocabulaire que la citation de
 * conversation**, et la même lecture du MIME : un utilisateur qui cite une
 * photo dans un fil et une photo sous un post ne doit pas rencontrer deux mots
 * pour le même fait. `location` n'a pas d'occurrence sur `PostMedia` — on ne
 * scinde pas l'énumération pour autant, deux vocabulaires voisins divergeraient
 * au premier ajout.
 */
export type QuotedPostMediaKind = AttachmentReplyKind;

/** Ce que `metadata.quotedPostMedia` porte, et RIEN d'autre. */
export type QuotedPostMedia = {
  readonly postMediaId: string;
  readonly kind: QuotedPostMediaKind;
};

/**
 * Les DEUX champs figés. Une liste, pas un commentaire : `parseQuotedPostMedia`
 * la projette, si bien qu'un champ de plus ajouté à la forme sans être ajouté
 * ici ne franchit jamais la frontière.
 */
export const QUOTED_POST_MEDIA_FROZEN_FIELDS = ['postMediaId', 'kind'] as const;

/**
 * Ce qui se RELIT à chaque service — jamais figé dans l'instantané. Énumérée
 * ici pour que le témoin qui garde la frontière puisse la lire : une liste que
 * personne ne peut consulter n'est pas une frontière.
 *
 * `caption` et `alt` s'y ajoutent au regard de la liste de #6164 : ils sont
 * ÉDITABLES après coup (`mediaCaptionWrites.ts`), donc les figer servirait
 * indéfiniment une légende que l'auteur a retirée.
 */
export const QUOTED_POST_MEDIA_REVOCABLE_FIELDS = [
  'fileUrl',
  'thumbnailUrl',
  'thumbHash',
  'fileName',
  'originalName',
  'fileSize',
  'duration',
  'width',
  'height',
  'caption',
  'alt',
  'transcription',
  'translations',
] as const;

/**
 * La nature d'un média depuis son MIME — délégué au site UNIQUE partagé avec la
 * citation de conversation. Un MIME absent vaut `file`.
 */
export function quotedPostMediaKindFor(mimeType: string | null | undefined): QuotedPostMediaKind {
  return attachmentReplyKindFor(mimeType);
}

/**
 * La frontière, appliquée : un objet quelconque devient un instantané VALIDE ou
 * `null`. La projection est explicite — tout champ qui n'est pas figé est
 * laissé dehors, y compris (et surtout) quand l'appelant l'a envoyé.
 */
export function parseQuotedPostMedia(input: unknown): QuotedPostMedia | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const row = input as Record<string, unknown>;
  const postMediaId = typeof row['postMediaId'] === 'string' ? row['postMediaId'].trim() : '';
  if (postMediaId.length === 0) return null;
  const declared = row['kind'];
  const kind = (['image', 'video', 'audio', 'location', 'file'] as const).find((k) => k === declared);
  if (!kind) return null;
  return { postMediaId, kind };
}

/** Relit l'instantané gravé sur le commentaire qui CITE. */
export function quotedPostMediaFromMetadata(metadata: unknown): QuotedPostMedia | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  return parseQuotedPostMedia((metadata as Record<string, unknown>)['quotedPostMedia']);
}

/**
 * PLAT, pas une union discriminée : le `tsconfig` du gateway pose
 * `strictNullChecks: false`, sous lequel un `if (!verdict.ok)` ne restreint PAS
 * une union sur un littéral booléen — le site d'appel ne verrait jamais
 * `reason`. Une forme qui ne compile pas sous le réglage RÉEL du projet n'est
 * pas plus sûre, elle est seulement absente.
 */
export type QuotedPostMediaAdmission = {
  readonly ok: boolean;
  readonly snapshot?: QuotedPostMedia | null;
  readonly reason?: string;
};

/** Le strict nécessaire de Prisma : la ligne du média, et son porteur. */
type PostMediaOwnerReader = {
  readonly postMedia: {
    findUnique: (args: {
      where: { id: string };
      select: { id: true; postId: true; mimeType: true };
    }) => Promise<{ id: string; postId: string | null; mimeType: string | null } | null>;
  };
};

/**
 * LA GARDE D'ÉCRITURE — site UNIQUE de la règle.
 *
 * Elle lie le MÉDIA au POST COMMENTÉ, et rien de plus. **Ce n'est pas une faute
 * de frappe qu'on tolérerait en retombant sur le premier média** : citer le
 * média d'une publication qu'on ne lit pas est une FUITE. L'audience du fil a
 * déjà été tranchée en amont (`resolveInteractionTarget`) — c'est précisément
 * ce qui rend cette égalité suffisante : un média du post commenté est, par
 * construction, déjà visible de qui écrit le commentaire.
 *
 * Le `postId` attendu est celui de la CIBLE réelle (la racine, pour un repost
 * simple), jamais celui du chemin : commenter un repost atterrit sur le fil de
 * sa racine, donc citer y vise les médias de la racine.
 *
 * La NATURE est DÉRIVÉE du MIME relu, jamais de ce que le client déclare :
 * `kind` est le seul fait descriptif qui survit à la suppression du média, donc
 * c'est le seul que le client ne doit pas pouvoir forger. Un client qui annonce
 * `file` sur une vidéo verrait sinon sa citation dire « un fichier » pour
 * toujours.
 *
 * Un commentaire qui ne cite aucun média ne coûte AUCUNE requête.
 */
export async function admitQuotedPostMedia(
  prisma: PostMediaOwnerReader,
  params: { readonly postId: string; readonly quotedPostMedia?: unknown }
): Promise<QuotedPostMediaAdmission> {
  const declared = params.quotedPostMedia;
  if (declared === undefined || declared === null) return { ok: true, snapshot: null };

  if (typeof declared !== 'object' || Array.isArray(declared)) {
    return { ok: false, reason: 'quotedPostMedia doit être un objet { postMediaId }' };
  }
  const raw = (declared as Record<string, unknown>)['postMediaId'];
  const postMediaId = typeof raw === 'string' ? raw.trim() : '';
  if (postMediaId.length === 0) {
    return { ok: false, reason: 'quotedPostMedia.postMediaId est requis' };
  }

  const postId = params.postId?.trim() ?? '';
  if (postId.length === 0) {
    return { ok: false, reason: 'Citer un média exige de connaître le post commenté' };
  }

  const media = await prisma.postMedia.findUnique({
    where: { id: postMediaId },
    select: { id: true, postId: true, mimeType: true },
  });
  if (!media || media.postId !== postId) {
    return { ok: false, reason: 'Le média cité n’appartient pas au post commenté' };
  }

  return { ok: true, snapshot: { postMediaId: media.id, kind: quotedPostMediaKindFor(media.mimeType) } };
}
