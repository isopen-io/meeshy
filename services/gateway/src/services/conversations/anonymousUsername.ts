import type { PrismaClient } from '@meeshy/shared/prisma/client';

/**
 * Premier pseudo libre DANS CETTE conversation — la seule portée où deux
 * pseudos identiques se voient — parmi des candidats tirés par `draw`.
 *
 * Depuis #10602, tout pseudo anonyme se termine par un nombre de 2 à 5
 * chiffres (`numberedAnonymousUsername`) : une collision se résout en tirant
 * un autre nombre, plus en refusant la personne ni en lui imposant un rang
 * (`ano_bob2`). Un candidat déjà essayé n'est pas réinterrogé.
 *
 * Partagé par toutes les portes de jonction d'un invité, qui passent par
 * `joinAsGuest` (`routes/conversations/link-admission.ts`, #4167).
 *
 * Rend `null` quand les tirages sont épuisés. La borne n'est pas un détail de
 * confort : les boucles qu'elle remplaçait à l'origine étaient des
 * `while (true)` qu'un pseudo durablement pris faisait tourner jusqu'à l'OOM
 * du process, un déni de service à un POST non authentifié.
 */
export const MAX_USERNAME_DRAWS = 25;

export async function findFreeAnonymousUsername(
  prisma: Pick<PrismaClient, 'participant'>,
  draw: () => string,
  conversationId: string
): Promise<string | null> {
  const tried = new Set<string>();

  for (let attempt = 0; attempt < MAX_USERNAME_DRAWS; attempt++) {
    const candidate = draw();
    if (tried.has(candidate)) continue;
    tried.add(candidate);

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
