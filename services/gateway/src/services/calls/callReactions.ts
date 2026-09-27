import type { CallReactionEmoji } from '@meeshy/shared/types/call-controls';

/**
 * Le compte des réactions d'un appel (#8439), une clé par emoji sur
 * `CallSession.reactionCounts`.
 *
 * Commande brute plutôt qu'un lire-puis-écrire : cinq réactions par seconde et
 * par participant arrivent en même temps, et une relecture perdrait des
 * incréments. Le pipeline `$ifNull` traite un champ absent (toute session
 * antérieure, ou sans réaction) comme zéro, en une seule écriture — même raison
 * que `recordShareLinkVisit`. L'emoji vient de la liste blanche validée à la
 * frontière : il ne contient ni `.` ni `$`, donc il est une clé sûre.
 */

type RawCommandRunner = {
  $runCommandRaw(command: Record<string, unknown>): Promise<unknown>;
};

/** `@@map` absent du modèle : la collection porte le nom du modèle. */
const CALL_SESSION_COLLECTION = 'CallSession';

export async function recordCallReaction(
  prisma: RawCommandRunner,
  callId: string,
  emoji: CallReactionEmoji
): Promise<void> {
  await prisma.$runCommandRaw({
    update: CALL_SESSION_COLLECTION,
    updates: [
      {
        q: { _id: { $oid: callId } },
        u: [
          {
            $set: {
              reactionCounts: {
                $mergeObjects: [
                  { $ifNull: ['$reactionCounts', {}] },
                  { [emoji]: { $add: [{ $ifNull: [`$reactionCounts.${emoji}`, 0] }, 1] } },
                ],
              },
            },
          },
        ],
      },
    ],
  });
}
