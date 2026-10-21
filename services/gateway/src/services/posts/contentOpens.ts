import { incrementPostCounters } from './postCounters';
import { openOriginKey } from './viewProvenance';

type RawCommandRunner = Parameters<typeof incrementPostCounters>[0];

export type ContentOpen = { readonly postId: string; readonly origin?: string };

/**
 * L'ENGAGEMENT D'OUVERTURE (#10483, demande du porteur 2026-10-13) — le TAP
 * sur un contenu d'un listing. Il ne compte AUCUNE vue (la vue est comptée par
 * l'écran ouvert) : `openCountByOrigin.<origine>` +1 par occurrence, une
 * écriture par post, sur des posts DÉJÀ gardés par l'appelant. Une origine
 * inconnue ou absente est comptée sous `other`. Aucune ligne n'est écrite :
 * ni identité, ni jeton, ni adresse.
 */
export async function creditOpens(prisma: RawCommandRunner, opens: readonly ContentOpen[]): Promise<void> {
  const parPost = opens.reduce<Map<string, Map<string, number>>>((acc, open) => {
    const key = openOriginKey(open.origin);
    const origins = acc.get(open.postId) ?? new Map<string, number>();
    return acc.set(open.postId, origins.set(key, (origins.get(key) ?? 0) + 1));
  }, new Map());
  await Promise.all([...parPost].map(([postId, origins]) =>
    incrementPostCounters(prisma, [postId], { breakdowns: { openCountByOrigin: Object.fromEntries(origins) } })));
}
