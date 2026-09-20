/**
 * La frontière de lecture DU LECTEUR (`ConversationReadCursor`), projetée pour
 * la liste (`core-list.ts`) et le détail (`core-detail.ts`) de conversation.
 * Issue #7198 : `lastReadMessageId`, `lastReadAt`, `lastReadMessageCreatedAt`
 * sont servis INCONDITIONNELLEMENT — pas seulement quand le pont ✦ s'affiche
 * (`bridge`, gouverné par `unreadCount > 0`) — c'est cette frontière qui
 * décide où un fil s'ouvre (D-L2, #7198 § G1) et ce que dit son séparateur,
 * pas seulement le pont.
 *
 * Site UNIQUE pour les deux routes, à la demande du cadrage du lot (une seule
 * projection réutilisable plutôt qu'une logique dupliquée — `core-list.ts`
 * est déjà proche de son budget de taille).
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';

export type ReadCursorBoundary = {
  readonly lastReadMessageId: string | null;
  readonly lastReadAt: Date | null;
  readonly lastReadMessageCreatedAt: Date | null;
};

/** Ce que chaque lecture coûte — un seul `select`, partagé par les deux appelants. */
const READ_CURSOR_SELECT = {
  participantId: true,
  lastReadMessageId: true,
  lastReadAt: true,
  lastReadMessageCreatedAt: true,
} as const;

/**
 * Une lecture BATCHÉE, par `Participant.id` — un seul appelant (le détail
 * passe un tableau à une entrée, la liste toute sa page). Un `participantId`
 * sans ligne de curseur (jamais ouverte) est simplement ABSENT de la map
 * rendue : l'absence ne se fabrique jamais (REV-4).
 */
export async function loadReadCursorBoundaries(
  prisma: PrismaClient,
  participantIds: readonly string[]
): Promise<Map<string, ReadCursorBoundary>> {
  const boundaries = new Map<string, ReadCursorBoundary>();
  if (participantIds.length === 0) return boundaries;

  const cursors = await prisma.conversationReadCursor.findMany({
    where: { participantId: { in: [...participantIds] } },
    select: READ_CURSOR_SELECT
  });
  for (const cursor of cursors) {
    boundaries.set(cursor.participantId, {
      lastReadMessageId: cursor.lastReadMessageId ?? null,
      lastReadAt: cursor.lastReadAt ?? null,
      lastReadMessageCreatedAt: cursor.lastReadMessageCreatedAt ?? null
    });
  }
  return boundaries;
}

/**
 * La frontière, prête à être ÉPANDUE dans une charge de réponse : chaque clé
 * n'apparaît que si sa valeur existe — jamais `null`, jamais fabriquée.
 */
export function projectReadCursorBoundary(
  boundary: ReadCursorBoundary | undefined
): Partial<Record<keyof ReadCursorBoundary, string | Date>> {
  if (!boundary) return {};
  return {
    ...(boundary.lastReadMessageId ? { lastReadMessageId: boundary.lastReadMessageId } : {}),
    ...(boundary.lastReadAt ? { lastReadAt: boundary.lastReadAt } : {}),
    ...(boundary.lastReadMessageCreatedAt ? { lastReadMessageCreatedAt: boundary.lastReadMessageCreatedAt } : {})
  };
}
