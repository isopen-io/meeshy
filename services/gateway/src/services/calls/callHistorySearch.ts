/**
 * LA RECHERCHE DU JOURNAL DES APPELS, CÔTÉ SERVEUR (#8203) — rend les
 * conversations du lecteur dont le NOM AFFICHÉ par la ligne contient la
 * recherche : nom du pair, puis son identifiant (fil direct), puis le titre de
 * la conversation. Sans accents ni casse, comme `searchCallRecords` (web) et
 * `CallsViewModel` (iOS) qu'elle remplace.
 *
 * La comparaison se fait ICI plutôt qu'en base : Prisma sur MongoDB ne sait
 * pas replier les accents, et l'ensemble lu est borné par les conversations
 * du lecteur (deux lectures légères), jamais par ses appels.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';

const foldForSearch = (text: string): string => text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase().trim();

const present = (value: string | null | undefined): value is string => typeof value === 'string' && value !== '';

export function normalizedJournalQuery(raw: string | undefined): string | null {
  const folded = foldForSearch(raw ?? '');
  return folded === '' ? null : folded;
}

export async function journalConversationsMatching(prisma: PrismaClient, userId: string, query: string): Promise<string[]> {
  const needle = foldForSearch(query);
  const memberships = await prisma.participant.findMany({
    where: { userId, isActive: true },
    select: { conversationId: true, conversation: { select: { type: true, title: true } } }
  });
  const directIds = memberships.filter((m) => m.conversation.type === 'direct').map((m) => m.conversationId);
  const peers =
    directIds.length === 0
      ? []
      : await prisma.participant.findMany({
          where: { conversationId: { in: directIds }, userId: { not: userId } },
          select: { conversationId: true, user: { select: { displayName: true, username: true } } }
        });
  const peerByConversation = new Map(
    peers.flatMap((p) => (p.user === null ? [] : [[p.conversationId, p.user] as const]))
  );
  const matches = (field: string | null | undefined): boolean => present(field) && foldForSearch(field).includes(needle);

  return memberships
    .filter((m) => {
      const peer = m.conversation.type === 'direct' ? peerByConversation.get(m.conversationId) : undefined;
      const displayed = [peer?.displayName, peer?.username, m.conversation.title].find(present);
      return matches(displayed) || matches(peer?.username);
    })
    .map((m) => m.conversationId);
}
