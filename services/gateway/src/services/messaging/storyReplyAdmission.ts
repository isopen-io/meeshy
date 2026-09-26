import { isValidMongoId } from '@meeshy/shared/utils/conversation-helpers';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { canUserConsumePost, type PostAclPrisma } from '../posts/postVisibility';

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
 * SECONDE BORNE — l'EXPÉDITEUR doit avoir le droit de VOIR la story. Que
 * l'auteur soit membre ne suffit pas : dans un groupe où il siège, un
 * identifiant de story FRIENDS / PRIVATE connu diffuserait son instantané à
 * des membres hors audience. Le verdict est `canUserConsumePost`
 * (`services/posts/postVisibility.ts`), la loi d'audience de LECTURE — aucune
 * règle n'est réécrite ici. Un expéditeur ANONYME (participant sans `userId`)
 * est refusé d'office, même sur une story PUBLIC : répondre à une story est un
 * geste de compte. L'auteur qui cite sa propre story est admis par le verdict
 * lui-même. Cette borne passe AVANT l'appartenance de l'auteur : qui ne voit
 * pas la story n'apprend rien de la conversation.
 *
 * TROISIÈME BORNE (#7951) — la conversation est DIRECTE, et l'AUTRE
 * participant est l'auteur. La règle de #7882 (« l'auteur est membre ») admettait
 * encore un GROUPE où l'auteur siège : l'instantané y partait à tous les
 * membres. C'est la loi iOS `StoryReplyAdmission.admits` (SDK) : direct ET
 * interlocuteur = auteur. Un DM compte deux participants ; l'auteur y est
 * membre actif et l'expéditeur n'est pas l'auteur ⇒ l'autre est l'auteur.
 * Le type se lit AVANT l'appartenance : un refus de type ne révèle rien de la
 * composition du groupe. Conversation introuvable ⇒ refusée (fail-closed).
 *
 * Un envoi qui ne cite aucune story ne coûte AUCUNE requête.
 */

export type StoryReplyPrisma = PostAclPrisma & Pick<PrismaClient, 'conversation'>;

/** PLAT, pour la même raison qu'`AttachmentReplyAdmission` : `strictNullChecks: false`. */
export type StoryReplyAdmission = {
  readonly ok: boolean;
  readonly reason?: string;
};

const STORY_NOT_FOUND = 'La lecture n’a pas confirmé la story citée';
const NOT_VISIBLE_TO_SENDER = 'La story citée n’est pas visible par l’expéditeur';
const AUTHOR_NOT_MEMBER = 'L’auteur de la story citée n’est pas membre de cette conversation';
const NOT_A_DIRECT_CONVERSATION = 'Une réponse à une story ne vit que dans la conversation directe de son auteur';
const PEER_IS_NOT_AUTHOR = 'L’interlocuteur de cette conversation n’est pas l’auteur de la story citée';

export async function admitStoryReply(
  prisma: StoryReplyPrisma,
  params: {
    readonly conversationId: string;
    readonly senderParticipantId: string;
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
    select: {
      id: true, authorId: true, deletedAt: true,
      visibility: true, visibilityUserIds: true, expiresAt: true,
    },
  });
  if (!story || story.deletedAt) {
    return { ok: false, reason: STORY_NOT_FOUND };
  }

  const senderUserId = await senderUserIdOf(prisma, params.senderParticipantId);
  if (!senderUserId || !(await canUserConsumePost(prisma, story, senderUserId))) {
    return { ok: false, reason: NOT_VISIBLE_TO_SENDER };
  }

  const conversation = await prisma.conversation.findUnique({
    where: { id: params.conversationId },
    select: { type: true },
  });
  if (conversation?.type !== 'direct') {
    return { ok: false, reason: NOT_A_DIRECT_CONVERSATION };
  }

  const authorMembership = await prisma.participant.findFirst({
    where: { conversationId: params.conversationId, userId: story.authorId, isActive: true },
    select: { id: true, bannedAt: true },
  });
  if (!authorMembership || authorMembership.bannedAt) {
    return { ok: false, reason: AUTHOR_NOT_MEMBER };
  }

  if (senderUserId === story.authorId) {
    return { ok: false, reason: PEER_IS_NOT_AUTHOR };
  }

  return { ok: true };
}

async function senderUserIdOf(
  prisma: PostAclPrisma,
  senderParticipantId: string,
): Promise<string | null> {
  const sender = await prisma.participant.findUnique({
    where: { id: senderParticipantId },
    select: { userId: true },
  });
  return sender?.userId ?? null;
}
