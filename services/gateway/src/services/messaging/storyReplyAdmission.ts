import { isValidMongoId } from '@meeshy/shared/utils/conversation-helpers';

/**
 * RÉPONDRE À UNE STORY OU À UN MOOD, C'EST LE CITER — ET UNE CITATION SE BORNE
 * À LA CONVERSATION OÙ ELLE EST PUBLIÉE (#7882).
 *
 * `storyReplyToId` n'est pas un simple pointeur : `MessageProcessor.saveMessage`
 * gèle l'instantané du post (contenu, emoji du mood, vignette, compteurs) dans
 * `metadata.postReplyTo`, puis le message part vers TOUS les membres de la
 * conversation cible. Sans borne, un client pouvait publier la citation de la
 * story d'un tiers dans une conversation où ce tiers n'est pas — la jumelle
 * exacte de #6601 (`replyToId` borné par `admitAttachmentReply`), restée
 * ouverte sur le second champ de citation.
 *
 * La règle : le post existe, n'est pas supprimé, et son AUTEUR est membre
 * ACTIF de la conversation. Répondre à une story, c'est parler à son auteur ;
 * il doit donc être là pour l'entendre.
 *
 * « Membre actif » = la convention du gateway : `isActive: true` dans le
 * `where` (un départ ou un bannissement l'éteignent), et `bannedAt` relu en JS
 * — sous MongoDB un `bannedAt: null` ne matche pas un champ ABSENT, et
 * exclurait les lignes historiques (cf. `MeeshySocketIOManager`, audit C5).
 *
 * L'EXPIRATION (`Post.expiresAt`) n'est PAS une borne ici, par décision : le
 * gel de `postReplyTo` existe précisément pour qu'une réponse survive à
 * l'expiration de sa story (`attachmentReplySnapshot.ts` le dit : « `postReplyTo`
 * a le droit de survivre à l'expiration de son post — c'est sa fonctionnalité »),
 * et la citation n'atteint que des conversations où l'auteur lui-même est
 * membre. La fuite que ferme ce module est celle du TIERS absent, pas celle du
 * temps.
 *
 * Fail-CLOSED, deux raisons distinctes (règle des trois états,
 * `services/gateway/CLAUDE.md`) : « introuvable » (rien n'a pu être confirmé)
 * et « l'auteur n'est pas membre » (la preuve d'un rattachement fautif). Même
 * verdict — c'est une écriture — mais un `reason` propre à chacun.
 *
 * Un envoi qui ne cite aucune story ne coûte AUCUNE requête.
 */

/** PLAT, pour la même raison qu'`AttachmentReplyAdmission` : `strictNullChecks: false`. */
export type StoryReplyAdmission = {
  readonly ok: boolean;
  readonly reason?: string;
};

type StoryReplyReader = {
  readonly post: {
    findUnique: (args: {
      where: { id: string };
      select: { id: true; authorId: true; deletedAt: true };
    }) => Promise<{ id: string; authorId: string; deletedAt: Date | null } | null>;
  };
  readonly participant: {
    findFirst: (args: {
      where: { conversationId: string; userId: string; isActive: true };
      select: { id: true; bannedAt: true };
    }) => Promise<{ id: string; bannedAt: Date | null } | null>;
  };
};

const STORY_NOT_FOUND = 'La lecture n’a pas confirmé la story citée';
const AUTHOR_NOT_MEMBER = 'L’auteur de la story citée n’est pas membre de cette conversation';

export async function admitStoryReply(
  prisma: StoryReplyReader,
  params: {
    readonly conversationId: string;
    readonly storyReplyToId?: string | null;
  }
): Promise<StoryReplyAdmission> {
  const storyReplyToId = params.storyReplyToId?.trim() ?? '';
  if (storyReplyToId.length === 0) return { ok: true };

  if (!isValidMongoId(storyReplyToId)) {
    return { ok: false, reason: STORY_NOT_FOUND };
  }

  const story = await prisma.post.findUnique({
    where: { id: storyReplyToId },
    select: { id: true, authorId: true, deletedAt: true },
  });
  if (!story || story.deletedAt) {
    return { ok: false, reason: STORY_NOT_FOUND };
  }

  const authorMembership = await prisma.participant.findFirst({
    where: { conversationId: params.conversationId, userId: story.authorId, isActive: true },
    select: { id: true, bannedAt: true },
  });
  if (!authorMembership || authorMembership.bannedAt) {
    return { ok: false, reason: AUTHOR_NOT_MEMBER };
  }

  return { ok: true };
}
