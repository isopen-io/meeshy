/**
 * Nommer ce qu'un signalement DÉSIGNE (#8876, § 6.4).
 *
 * Un `Report` porte `reportedType` + `reportedEntityId` — un couple polymorphe,
 * sans relation Prisma. La console affichait donc « message 66e… » là où le
 * modérateur veut lire « Message d'Awa Diop dans Famille ». L'entité signalée et
 * les deux personnes (signalant, modérateur) se résolvent ici, PAR LOT : une
 * requête par genre présent dans la page, jamais une par ligne, aucune pour un
 * genre absent.
 *
 * ## Ce que la page sert du contenu, et ce qu'elle retient
 *
 * `excerpt` — un extrait de ce qui a été signalé — n'est servi qu'avec
 * `canModerateContent`, et JAMAIS pour un contenu protégé. La protection d'un
 * message est celle que tout le dépôt applique (`messageContentIsProtected` :
 * vue unique, flou, effet masquant, éphémère consommé, chiffré) ; celle d'une
 * publication est son audience restreinte (PRIVATE, ONLY, EXCEPT) — le signalant
 * a pu voir ce que l'auteur n'a pas publié au monde. Un contenu retiré
 * (`deletedAt`) n'a pas d'extrait non plus : le retrait est une décision de
 * modération qu'on ne contourne pas en relisant le texte.
 *
 * Le masque DIT qu'il masque : `isProtected: true` et `excerpt: null` — la
 * console écrit « Contenu protégé », jamais un vide qui se lirait comme « pas de
 * texte ».
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { messageContentIsProtected, messageContentProtectionSelect } from './media-protection';
import {
  ADMIN_PERSON_SELECT,
  distinctObjectIds,
  loadAdminPeople,
  personLabel,
  toAdminPerson,
  type AdminPersonRef,
} from './oversight-people';

const EXCERPT_LENGTH = 120;
const POST_KINDS: ReadonlySet<string> = new Set(['post', 'story', 'reel', 'status']);
const RESTRICTED_AUDIENCES: ReadonlySet<string> = new Set(['PRIVATE', 'ONLY', 'EXCEPT']);

export type ReportedEntity = {
  readonly type: string;
  readonly id: string;
  readonly label: string | null;
  readonly owner: AdminPersonRef | null;
  readonly excerpt: string | null;
  readonly isProtected: boolean;
  readonly deleted: boolean;
  readonly conversation: { readonly id: string; readonly title: string | null } | null;
};

type RawReport = {
  readonly reportedType?: string | null;
  readonly reportedEntityId?: string | null;
  readonly reporterId?: string | null;
  readonly moderatorId?: string | null;
};

export type EnrichedReport<Row extends RawReport> = Row & {
  readonly reporter: AdminPersonRef | null;
  readonly moderator: AdminPersonRef | null;
  readonly reportedEntity: ReportedEntity | null;
};

type Resolved = Omit<ReportedEntity, 'type' | 'id'>;

const UNKNOWN: Resolved = {
  label: null,
  owner: null,
  excerpt: null,
  isProtected: false,
  deleted: false,
  conversation: null,
};

const GONE: Resolved = { ...UNKNOWN, deleted: true };

const clean = (text: string | null | undefined): string | null => {
  const trimmed = text?.trim();
  return trimmed ? trimmed : null;
};

const clip = (text: string | null | undefined): string | null => {
  const trimmed = clean(text);
  if (trimmed === null) return null;
  return trimmed.length > EXCERPT_LENGTH ? `${trimmed.slice(0, EXCERPT_LENGTH)}…` : trimmed;
};

const idsOfKinds = (reports: readonly RawReport[], kinds: ReadonlySet<string>): string[] =>
  distinctObjectIds(
    reports.filter((report) => kinds.has(report.reportedType ?? '')).map((report) => report.reportedEntityId)
  );

const idsOfKind = (reports: readonly RawReport[], kind: string): string[] =>
  idsOfKinds(reports, new Set([kind]));

async function lookup<Row extends { id: string }>(
  ids: readonly string[],
  read: (ids: string[]) => Promise<Row[]>
): Promise<ReadonlyMap<string, Row>> {
  if (ids.length === 0) return new Map();
  const rows = await read([...ids]);
  return new Map(rows.map((row) => [row.id, row]));
}

/** Le propriétaire d'un message : le compte derrière l'expéditeur, ou l'invité nommé tel qu'il s'est présenté. */
function messageOwner(sender: {
  readonly id: string;
  readonly displayName: string;
  readonly avatar: string | null;
  readonly user: AdminPersonRef | null;
}): AdminPersonRef {
  return (
    toAdminPerson(sender.user) ?? {
      id: sender.id,
      username: '',
      displayName: clean(sender.displayName),
      avatar: sender.avatar,
    }
  );
}

export async function enrichReports<Row extends RawReport>(
  prisma: PrismaClient,
  reports: readonly Row[],
  options: { readonly canSeeExcerpt: boolean }
): Promise<EnrichedReport<Row>[]> {
  if (reports.length === 0) return [];

  const messageIds = idsOfKind(reports, 'message');
  const conversationIds = idsOfKind(reports, 'conversation');
  const communityIds = idsOfKind(reports, 'community');
  const postIds = idsOfKinds(reports, POST_KINDS);
  const commentIds = idsOfKind(reports, 'comment');
  const soundIds = idsOfKind(reports, 'sound');

  const [people, messages, conversations, communities, posts, comments, sounds] = await Promise.all([
    loadAdminPeople(prisma, [
      ...reports.map((report) => report.reporterId),
      ...reports.map((report) => report.moderatorId),
      ...idsOfKind(reports, 'user'),
    ]),
    lookup(messageIds, (ids) =>
      prisma.message.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          content: true,
          conversationId: true,
          deletedAt: true,
          ...messageContentProtectionSelect,
          sender: {
            select: {
              id: true,
              displayName: true,
              avatar: true,
              user: { select: ADMIN_PERSON_SELECT },
            },
          },
        },
        take: ids.length,
      })
    ),
    lookup(conversationIds, (ids) =>
      prisma.conversation.findMany({
        where: { id: { in: ids } },
        select: { id: true, title: true },
        take: ids.length,
      })
    ),
    lookup(communityIds, (ids) =>
      prisma.community.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true, deletedAt: true, creator: { select: ADMIN_PERSON_SELECT } },
        take: ids.length,
      })
    ),
    lookup(postIds, (ids) =>
      prisma.post.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          content: true,
          visibility: true,
          deletedAt: true,
          author: { select: ADMIN_PERSON_SELECT },
        },
        take: ids.length,
      })
    ),
    lookup(commentIds, (ids) =>
      prisma.postComment.findMany({
        where: { id: { in: ids } },
        select: { id: true, content: true, deletedAt: true, author: { select: ADMIN_PERSON_SELECT } },
        take: ids.length,
      })
    ),
    lookup(soundIds, (ids) =>
      prisma.sound.findMany({
        where: { id: { in: ids } },
        select: { id: true, title: true, uploader: { select: ADMIN_PERSON_SELECT } },
        take: ids.length,
      })
    ),
  ]);

  const missingTitles = distinctObjectIds(
    [...messages.values()].map((message) => message.conversationId).filter((id) => !conversations.has(id))
  );
  const messageConversations = await lookup(missingTitles, (ids) =>
    prisma.conversation.findMany({
      where: { id: { in: ids } },
      select: { id: true, title: true },
      take: ids.length,
    })
  );
  const titleOf = (conversationId: string): string | null =>
    clean((conversations.get(conversationId) ?? messageConversations.get(conversationId))?.title);

  const excerptIf = (allowed: boolean, text: string | null | undefined): string | null =>
    options.canSeeExcerpt && allowed ? clip(text) : null;

  const resolve = (type: string, id: string): Resolved => {
    if (type === 'user') {
      const person = people.get(id);
      return person ? { ...UNKNOWN, label: personLabel(person).label } : GONE;
    }
    if (type === 'message') {
      const row = messages.get(id);
      if (!row) return GONE;
      const isProtected = messageContentIsProtected(row);
      const deleted = row.deletedAt !== null;
      return {
        label: null,
        owner: messageOwner({ ...row.sender, user: toAdminPerson(row.sender.user) }),
        excerpt: excerptIf(!isProtected && !deleted, row.content),
        isProtected,
        deleted,
        conversation: { id: row.conversationId, title: titleOf(row.conversationId) },
      };
    }
    if (type === 'conversation') {
      const row = conversations.get(id);
      return row ? { ...UNKNOWN, label: clean(row.title) } : GONE;
    }
    if (type === 'community') {
      const row = communities.get(id);
      return row
        ? { ...UNKNOWN, label: clean(row.name), owner: toAdminPerson(row.creator), deleted: row.deletedAt !== null }
        : GONE;
    }
    if (POST_KINDS.has(type)) {
      const row = posts.get(id);
      if (!row) return GONE;
      const isProtected = RESTRICTED_AUDIENCES.has(row.visibility);
      const deleted = row.deletedAt !== null;
      return {
        ...UNKNOWN,
        owner: toAdminPerson(row.author),
        excerpt: excerptIf(!isProtected && !deleted, row.content),
        isProtected,
        deleted,
      };
    }
    if (type === 'comment') {
      const row = comments.get(id);
      if (!row) return GONE;
      const deleted = row.deletedAt !== null;
      return { ...UNKNOWN, owner: toAdminPerson(row.author), excerpt: excerptIf(!deleted, row.content), deleted };
    }
    if (type === 'sound') {
      const row = sounds.get(id);
      return row ? { ...UNKNOWN, label: clean(row.title), owner: toAdminPerson(row.uploader) } : GONE;
    }
    return UNKNOWN;
  };

  return reports.map((report) => ({
    ...report,
    reporter: report.reporterId ? (people.get(report.reporterId) ?? null) : null,
    moderator: report.moderatorId ? (people.get(report.moderatorId) ?? null) : null,
    reportedEntity:
      report.reportedType && report.reportedEntityId
        ? {
            type: report.reportedType,
            id: report.reportedEntityId,
            ...resolve(report.reportedType, report.reportedEntityId),
          }
        : null,
  }));
}
