/**
 * Nommer la CIBLE d'une ligne d'audit (#8876, § 6.2).
 *
 * Une ligne d'audit dit « quelqu'un a touché l'entité `Post` n° 66e… » ; la
 * console doit dire « Awa a retiré la story d'Awa Diop ». Le libellé se résout
 * PAR GENRE et PAR LOT : une requête par genre présent dans la page, jamais une
 * par ligne, et aucune pour un genre absent.
 *
 * ## Ce qui ne sert JAMAIS de libellé
 *
 * - Un lien de partage se nomme par son `name` — jamais par son `identifier` ni
 *   son `linkId`, qui OUVRENT la conversation (`SHARE_LINK_JOIN_KEY_COLUMNS`).
 *   Le `select` ne les demande même pas : ce qui n'est pas lu ne peut pas partir.
 * - Un identifiant brut n'est jamais un libellé : sans nom connu (cible
 *   supprimée, genre sans nom comme `Agent`), `label` vaut `null` et la console
 *   choisit sa propre formule.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { distinctObjectIds, personLabel, type AdminPersonRef } from './oversight-people';

export type AuditTarget = {
  readonly type: string;
  readonly id: string;
  readonly label: string | null;
  readonly secondary: string | null;
};

type TargetRef = { readonly entity: string; readonly entityId: string };
type Named = { readonly label: string | null; readonly secondary: string | null };

const NAMELESS: Named = { label: null, secondary: null };

const clean = (text: string | null | undefined): string | null => {
  const trimmed = text?.trim();
  return trimmed ? trimmed : null;
};

export const targetKey = (entity: string, entityId: string): string => `${entity}:${entityId}`;

const idsOf = (refs: readonly TargetRef[], entity: string): string[] =>
  distinctObjectIds(refs.filter((ref) => ref.entity === entity).map((ref) => ref.entityId));

/** Une requête par genre ; `[]` sans ligne cible de ce genre dans la page. */
async function lookup<Row extends { id: string }>(
  ids: readonly string[],
  read: (ids: string[]) => Promise<Row[]>
): Promise<ReadonlyMap<string, Row>> {
  if (ids.length === 0) return new Map();
  const rows = await read([...ids]);
  return new Map(rows.map((row) => [row.id, row]));
}

function nameOf(people: ReadonlyMap<string, AdminPersonRef>, id: string): Named {
  const person = people.get(id);
  return person ? personLabel(person) : NAMELESS;
}

export async function resolveAuditTargets(
  prisma: PrismaClient,
  refs: readonly TargetRef[],
  people: ReadonlyMap<string, AdminPersonRef>
): Promise<ReadonlyMap<string, Named>> {
  const conversationIds = idsOf(refs, 'Conversation');
  const communityIds = idsOf(refs, 'Community');
  const shareLinkIds = idsOf(refs, 'ConversationShareLink');
  const postIds = idsOf(refs, 'Post');
  const broadcastIds = idsOf(refs, 'Broadcast');
  const reportIds = idsOf(refs, 'Report');
  const trackingLinkIds = idsOf(refs, 'TrackingLink');

  const [conversations, communities, shareLinks, posts, broadcasts, reports, trackingLinks] = await Promise.all([
    lookup(conversationIds, (ids) =>
      prisma.conversation.findMany({
        where: { id: { in: ids } },
        select: { id: true, title: true, type: true },
        take: ids.length,
      })
    ),
    lookup(communityIds, (ids) =>
      prisma.community.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true, identifier: true },
        take: ids.length,
      })
    ),
    lookup(shareLinkIds, (ids) =>
      prisma.conversationShareLink.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true, conversation: { select: { title: true } } },
        take: ids.length,
      })
    ),
    lookup(postIds, (ids) =>
      prisma.post.findMany({
        where: { id: { in: ids } },
        select: { id: true, type: true, author: { select: { displayName: true, username: true } } },
        take: ids.length,
      })
    ),
    lookup(broadcastIds, (ids) =>
      prisma.adminBroadcast.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true, subject: true },
        take: ids.length,
      })
    ),
    lookup(reportIds, (ids) =>
      prisma.report.findMany({
        where: { id: { in: ids } },
        select: { id: true, reportType: true, reportedType: true },
        take: ids.length,
      })
    ),
    lookup(trackingLinkIds, (ids) =>
      prisma.trackingLink.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true, campaign: true },
        take: ids.length,
      })
    ),
  ]);

  const nameFor = ({ entity, entityId }: TargetRef): Named => {
    switch (entity) {
      case 'User':
        return nameOf(people, entityId);
      case 'Conversation': {
        const row = conversations.get(entityId);
        return row ? { label: clean(row.title), secondary: clean(row.type) } : NAMELESS;
      }
      case 'Community': {
        const row = communities.get(entityId);
        return row ? { label: clean(row.name), secondary: clean(row.identifier) } : NAMELESS;
      }
      case 'ConversationShareLink': {
        const row = shareLinks.get(entityId);
        return row ? { label: clean(row.name), secondary: clean(row.conversation?.title) } : NAMELESS;
      }
      case 'Post': {
        const row = posts.get(entityId);
        if (!row) return NAMELESS;
        const author = row.author ? personLabel(row.author) : NAMELESS;
        return { label: author.label, secondary: clean(row.type) };
      }
      case 'Broadcast': {
        const row = broadcasts.get(entityId);
        return row ? { label: clean(row.name), secondary: clean(row.subject) } : NAMELESS;
      }
      case 'Report': {
        const row = reports.get(entityId);
        return row ? { label: clean(row.reportType), secondary: clean(row.reportedType) } : NAMELESS;
      }
      case 'TrackingLink': {
        const row = trackingLinks.get(entityId);
        if (!row) return NAMELESS;
        const name = clean(row.name);
        return name
          ? { label: name, secondary: clean(row.campaign) }
          : { label: clean(row.campaign), secondary: null };
      }
      default:
        return NAMELESS;
    }
  };

  return new Map(refs.map((ref) => [targetKey(ref.entity, ref.entityId), nameFor(ref)]));
}
