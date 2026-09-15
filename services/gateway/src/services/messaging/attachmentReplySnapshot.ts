/**
 * LA PIÈCE NOMMÉE D'UNE RÉPONSE — la forme figée, et la liste de ce qui ne peut
 * PAS l'être (#6164, arbitrage porteur du 2026-09-12 sur #6123, voie C hybride).
 *
 * Répondre à une conversation ne cite plus seulement un MESSAGE : on peut viser
 * la troisième photo d'un carrousel de cinq. Ce que la réponse GRAVE, elle le
 * grave pour toujours — donc elle ne grave que ce qui ne peut jamais devenir un
 * secret :
 *
 * | FIGÉ dans `metadata.attachmentReplyTo` | RELU à chaque service, via `mediaMayTravel` |
 * |---|---|
 * | `attachmentId` — l'ancre du saut | la vignette / `fileUrl` / le ThumbHash |
 * | `kind` — la NATURE du média | le nom de fichier, la taille |
 * | | la **DURÉE**, la transcription, la forme d'onde |
 *
 * Le PRÉCÉDENT du dépôt est `protectedPreview()`
 * (`services/notifications/NotificationService.ts`) : d'un contenu protégé, il
 * ne divulgue QUE l'icône de protection et l'icône de TYPE
 * (`contentTypeIcon`). La nature est donc le seul fait qu'on ait le droit de
 * figer. **La DURÉE ne peut pas l'être** — le cycle 125 la NOMME dans ce qu'une
 * protection doit garder (« texte, fichier, nom de fichier, taille, durée,
 * vignette, URL »).
 *
 * La voie A (instantané intégral, comme `postReplyTo`) est EXCLUE : un
 * instantané ne se relit pas, donc il survivrait à une protection posée APRÈS
 * la réponse et à la suppression de la pièce. `postReplyTo` a le droit de
 * survivre à l'expiration de son post — c'est sa fonctionnalité ; une vignette
 * de pièce jointe, non.
 *
 * **La liste des champs RÉVOCABLES vit ICI, à côté de la forme**, jamais
 * dispersée chez ses lecteurs : sans ce voisinage, le premier lecteur qui fige
 * un champ de plus le ferait sans qu'aucun témoin tombe.
 *
 * AUCUNE MIGRATION : `Message.metadata Json?` existe déjà
 * (`packages/shared/prisma/schema.prisma:781`), et `postReplySnapshot.ts` est
 * le motif éprouvé du même rangement.
 */

/** La NATURE du média cité — le seul fait, avec l'ancre, qui a le droit d'être figé. */
export type AttachmentReplyKind = 'image' | 'video' | 'audio' | 'location' | 'file';

const KINDS: readonly AttachmentReplyKind[] = ['image', 'video', 'audio', 'location', 'file'];

/** Ce que `metadata.attachmentReplyTo` porte, et RIEN d'autre. */
export type AttachmentReplyTo = {
  readonly attachmentId: string;
  readonly kind: AttachmentReplyKind;
};

/**
 * Les DEUX champs figés. Une liste, pas un commentaire : `parseAttachmentReplyTo`
 * la projette, si bien qu'un champ de plus ajouté à la forme sans être ajouté
 * ici ne franchit jamais la frontière.
 */
export const ATTACHMENT_REPLY_FROZEN_FIELDS = ['attachmentId', 'kind'] as const;

/**
 * Ce qui se RELIT à chaque service et que `mediaMayTravel` retient pièce par
 * pièce — jamais figé dans l'instantané. Énumérée ici pour que le témoin qui
 * garde la frontière puisse la lire : une liste que personne ne peut consulter
 * n'est pas une frontière.
 */
export const ATTACHMENT_REPLY_REVOCABLE_FIELDS = [
  'fileUrl',
  'thumbnailUrl',
  'thumbHash',
  'fileName',
  'originalName',
  'fileSize',
  'duration',
  'width',
  'height',
  'transcription',
  'waveform',
] as const;

/**
 * La nature d'une pièce depuis son MIME — la MÊME lecture que
 * `contentTypeIcon` (`NotificationService.ts`) et que `AttachmentKind(mimeType:)`
 * côté iOS. Un MIME absent vaut `file` : on ne sait pas, mais on sait que c'est
 * une pièce jointe.
 */
export function attachmentReplyKindFor(mimeType: string | null | undefined): AttachmentReplyKind {
  if (!mimeType) return 'file';
  if (mimeType === 'application/x-location') return 'location';
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  return 'file';
}

/**
 * La frontière, appliquée : un objet quelconque devient un instantané VALIDE ou
 * `null`. La projection est explicite — tout champ qui n'est pas figé est
 * laissé dehors, y compris (et surtout) quand l'appelant l'a envoyé.
 */
export function parseAttachmentReplyTo(input: unknown): AttachmentReplyTo | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const row = input as Record<string, unknown>;
  const attachmentId = typeof row['attachmentId'] === 'string' ? row['attachmentId'].trim() : '';
  if (attachmentId.length === 0) return null;
  const declared = row['kind'];
  const kind = KINDS.find((k) => k === declared);
  if (!kind) return null;
  return { attachmentId, kind };
}

/** Relit l'instantané gravé sur le message qui CITE. */
export function attachmentReplyToFromMetadata(metadata: unknown): AttachmentReplyTo | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  return parseAttachmentReplyTo((metadata as Record<string, unknown>)['attachmentReplyTo']);
}

/**
 * PLAT, pas une union discriminée : le `tsconfig` du gateway pose
 * `strictNullChecks: false`, sous lequel un `if (!verdict.ok)` ne restreint PAS
 * une union sur un littéral booléen — le site d'appel ne verrait jamais
 * `reason`. Une forme qui ne compile pas sous le réglage RÉEL du projet n'est
 * pas plus sûre, elle est seulement absente.
 *
 * `ok: false` ⇒ `reason` porte le motif du refus. `ok: true` ⇒ `snapshot` porte
 * l'instantané ADMIS, ou `null` quand l'envoi ne nomme aucune pièce.
 */
export type AttachmentReplyAdmission = {
  readonly ok: boolean;
  readonly snapshot?: AttachmentReplyTo | null;
  readonly reason?: string;
};

/** Le strict nécessaire de Prisma : la ligne de la pièce, son porteur, et le message cité. */
type AttachmentOwnerReader = {
  readonly messageAttachment: {
    findUnique: (args: {
      where: { id: string };
      select: { id: true; messageId: true; mimeType: true };
    }) => Promise<{ id: string; messageId: string; mimeType: string | null } | null>;
  };
  readonly message: {
    findUnique: (args: {
      where: { id: string };
      select: { id: true; conversationId: true; deletedAt: true };
    }) => Promise<{ id: string; conversationId: string; deletedAt: Date | null } | null>;
  };
};

/**
 * LA GARDE D'ENVOI — site UNIQUE de la règle, wiré par transport.
 *
 * Elle lie DEUX choses, lues ensemble : le message CITÉ à la CONVERSATION de
 * l'envoi, et la PIÈCE au message cité. « Citer la pièce d'un message qu'on ne
 * cite pas, c'est citer la pièce d'une conversation qu'on ne lit peut-être pas »
 * (#6601) — les deux bornes se répondent, et aucune ne dispense de l'autre.
 *
 * La première s'applique à TOUT `replyToId`, avec ou sans pièce citée : un
 * appelant qui répond dans la conversation A à un message de la conversation B
 * lirait un texte, un auteur et des pièces jointes qu'il n'a pas le droit de
 * voir. Au moindre doute — message introuvable, supprimé, porté par une autre
 * conversation — on REFUSE l'envoi (fail-CLOSED), en distinguant la PREUVE
 * d'un rattachement fautif (le message existe, ailleurs) de l'ABSENCE de
 * preuve (rien n'a pu être confirmé) : même verdict ici — c'est une écriture,
 * pas une notification à laisser passer par prudence — mais un `reason` propre
 * à chacun (règle des trois états, `services/gateway/CLAUDE.md` § « Une garde
 * d'admission se pose sur CHAQUE chemin »).
 *
 * La seconde, inchangée depuis #6164 : au moindre doute sur le lien PIÈCE ↔
 * MESSAGE CITÉ — pièce introuvable, porteur différent, forme illisible — on
 * refuse aussi. Ce n'est PAS une faute de frappe qu'on tolérerait en retombant
 * sur le représentatif : l'identifiant gravé sert d'ancre à un saut, et chaque
 * service qui le relit ira chercher la ligne.
 *
 * La NATURE est DÉRIVÉE du MIME relu, jamais de ce que le client déclare :
 * `kind` est le seul fait descriptif qui survit à une protection posée plus
 * tard, donc c'est le seul que le client ne doit pas pouvoir forger. Un client
 * qui annonce `file` sur une piste audio verrait sinon sa citation dire
 * « un fichier » pour toujours.
 *
 * Un envoi qui ne cite ni message ni pièce ne coûte AUCUNE requête.
 */
export async function admitAttachmentReply(
  prisma: AttachmentOwnerReader,
  params: {
    readonly conversationId: string;
    readonly replyToId?: string | null;
    readonly attachmentReplyTo?: unknown;
  }
): Promise<AttachmentReplyAdmission> {
  const replyToId = params.replyToId?.trim() ?? '';

  // #6601 — la borne de CONVERSATION, lue avant toute autre chose : elle
  // s'applique à CHAQUE citation, pas seulement à celles qui nomment une pièce.
  if (replyToId.length > 0) {
    const cited = await prisma.message.findUnique({
      where: { id: replyToId },
      select: { id: true, conversationId: true, deletedAt: true },
    });
    if (!cited || cited.deletedAt) {
      return { ok: false, reason: 'La lecture n’a pas confirmé le message cité' };
    }
    if (cited.conversationId !== params.conversationId) {
      return { ok: false, reason: 'Le message cité n’appartient pas à cette conversation' };
    }
  }

  const declared = params.attachmentReplyTo;
  if (declared === undefined || declared === null) return { ok: true, snapshot: null };

  if (typeof declared !== 'object' || Array.isArray(declared)) {
    return { ok: false, reason: 'attachmentReplyTo doit être un objet { attachmentId }' };
  }
  const raw = (declared as Record<string, unknown>)['attachmentId'];
  const attachmentId = typeof raw === 'string' ? raw.trim() : '';
  if (attachmentId.length === 0) {
    return { ok: false, reason: 'attachmentReplyTo.attachmentId est requis' };
  }

  if (replyToId.length === 0) {
    return { ok: false, reason: 'Citer une pièce jointe exige de citer le message qui la porte' };
  }

  const piece = await prisma.messageAttachment.findUnique({
    where: { id: attachmentId },
    select: { id: true, messageId: true, mimeType: true },
  });
  if (!piece || piece.messageId !== replyToId) {
    return { ok: false, reason: 'La pièce jointe citée n’appartient pas au message cité' };
  }

  return { ok: true, snapshot: { attachmentId: piece.id, kind: attachmentReplyKindFor(piece.mimeType) } };
}
