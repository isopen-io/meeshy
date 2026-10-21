import type { PrismaClient } from '@meeshy/shared/prisma/client';

/**
 * **L'AUTEUR DU CONTENU SIGNALÉ, RÉSOLU À UN ENDROIT** (#10458).
 *
 * Un modérateur ne traite pas un signalement qui vise son propre contenu — ni en
 * le classant, ni en le modifiant, ni en l'effaçant, ni en se l'attribuant. Les
 * routes qui écrivent sur un `Report` posaient cette garde pour le seul type
 * `user` : un MODERATOR classait le signalement de SA publication ou de SON
 * commentaire, le contenu restait en ligne et le signaleur était notifié du
 * classement. Les gestes sur le contenu (`take-offline`, `remove-comment`)
 * refusaient déjà `SELF_MODERATION` ; `dismiss` ne regardait aucun contenu.
 *
 * La ligne se lit SANS filtre de suppression : une publication retirée reste la
 * sienne, et le signalement qui la vise reste un signalement qui le vise.
 * Un message se résout par l'UTILISATEUR derrière son participant expéditeur :
 * `Message.senderId` est un id de `Participant`, qu'aucun id d'acteur n'égale
 * jamais ; un invité anonyme (`Participant.userId` nul) n'a pas d'auteur inscrit.
 * Une conversation ou une communauté n'ont pas d'auteur unique : `null`, et la
 * garde ne s'applique pas (fail-open assumé — aucun contenu propre n'y est en jeu).
 */
export type ReportedContent = {
  readonly reportedType: string;
  readonly reportedEntityId: string;
};

type AuthorLookup = (prisma: PrismaClient, id: string) => Promise<string | null>;

const authorOf =
  <Row>(read: (prisma: PrismaClient, id: string) => Promise<Row | null>, pick: (row: Row) => string | null): AuthorLookup =>
  async (prisma, id) => {
    const row = await read(prisma, id);
    return row === null || row === undefined ? null : pick(row);
  };

const AUTHOR_BY_TYPE: Readonly<Record<string, AuthorLookup>> = {
  user: async (_prisma, id) => id,
  post: authorOf((prisma, id) => prisma.post.findUnique({ where: { id }, select: { authorId: true } }), (row) => row.authorId),
  story: authorOf((prisma, id) => prisma.post.findUnique({ where: { id }, select: { authorId: true } }), (row) => row.authorId),
  reel: authorOf((prisma, id) => prisma.post.findUnique({ where: { id }, select: { authorId: true } }), (row) => row.authorId),
  status: authorOf((prisma, id) => prisma.post.findUnique({ where: { id }, select: { authorId: true } }), (row) => row.authorId),
  comment: authorOf((prisma, id) => prisma.postComment.findUnique({ where: { id }, select: { authorId: true } }), (row) => row.authorId),
  message: authorOf(
    (prisma, id) => prisma.message.findUnique({ where: { id }, select: { sender: { select: { userId: true } } } }),
    (row) => row.sender.userId,
  ),
  sound: authorOf((prisma, id) => prisma.sound.findUnique({ where: { id }, select: { uploaderId: true } }), (row) => row.uploaderId),
};

export async function reportedContentAuthorId(prisma: PrismaClient, report: ReportedContent): Promise<string | null> {
  const lookup = AUTHOR_BY_TYPE[report.reportedType];
  return lookup === undefined ? null : lookup(prisma, report.reportedEntityId);
}

export async function reportTargetsActor(prisma: PrismaClient, report: ReportedContent, actorId: string): Promise<boolean> {
  const author = await reportedContentAuthorId(prisma, report);
  return author !== null && author === actorId;
}
