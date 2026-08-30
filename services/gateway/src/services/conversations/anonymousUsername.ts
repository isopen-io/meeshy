import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { suffixAnonymousUsername } from '@meeshy/shared/utils/anonymous-username';

/**
 * Premier pseudo libre de la série `ano_bob`, `ano_bob2`, `ano_bob3`… dans
 * CETTE conversation — la seule portée où deux pseudos identiques se voient.
 *
 * Extrait de `routes/anonymous.ts` par #4167 pour que `POST /links/:key/members`
 * (`routes/conversations/link-admission.ts`) partage la MÊME règle plutôt que
 * de la retaper : une seconde copie aurait été exactement la dérive que #4167
 * ferme ailleurs.
 *
 * Rend `null` quand la série est épuisée. La borne n'est pas un détail de
 * confort : les deux boucles qu'elle remplaçait à l'origine étaient des
 * `while (true)` que seule la part aléatoire de `generateNickname` faisait
 * terminer — un pseudo demandé explicitement et durablement pris les faisait
 * tourner jusqu'à l'OOM du process, un déni de service à un POST non
 * authentifié.
 */
export const MAX_USERNAME_RANKS = 25;

export async function findFreeAnonymousUsername(
  prisma: Pick<PrismaClient, 'participant'>,
  desired: string,
  conversationId: string
): Promise<string | null> {
  for (let rank = 1; rank <= MAX_USERNAME_RANKS; rank++) {
    const candidate = rank === 1 ? desired : suffixAnonymousUsername(desired, rank);

    const taken = await prisma.participant.findFirst({
      where: {
        conversationId,
        displayName: candidate,
        type: 'anonymous',
        isActive: true,
      },
      select: { id: true },
    });

    if (!taken) return candidate;
  }

  return null;
}
