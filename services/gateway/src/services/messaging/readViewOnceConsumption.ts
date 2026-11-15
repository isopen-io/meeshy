/**
 * Qui a DÉJÀ ouvert quel message à vue unique — la lecture jumelle de
 * `recordViewOnceConsumption` (#7594).
 *
 * La consommation vit dans `MessageStatusEntry.viewedOnceAt`, par participant.
 * `GET /conversations` (`lastMessage.viewOnceConsumed`) et le recalcul de
 * `conversation:updated` (`lastMessageViewOnceConsumed`) la lisent ICI, pour
 * que le composeur rende « 👁 Ouvert » au lieu de « 👁 Vue unique ».
 *
 * ─── LE PIÈGE MONGO ─────────────────────────────────────────────────────────
 *
 * La colonne peut être ABSENTE (entrée créée par la livraison ou la lecture,
 * qui n'écrit que `deliveredAt` / `readAt`) ou présente-et-nulle, et un filtre
 * sur `viewedOnceAt` ne traite pas les deux de la même façon sur le connecteur
 * MongoDB de Prisma. La lecture ne filtre donc PAS sur la colonne : elle
 * rapatrie les entrées des couples demandés et tranche en mémoire — une date
 * posée, et rien d'autre, vaut « ouvert ».
 *
 * ─── L'ÉCHEC ────────────────────────────────────────────────────────────────
 *
 * Ce signal n'est pas une garde : il choisit entre deux placeholders qui ne
 * révèlent rien. Une lecture en échec rend l'ensemble VIDE — « pas encore
 * ouvert », la direction sûre — plutôt que de faire tomber la liste ou
 * l'émission qui la porte. `onError` laisse l'appelant la journaliser.
 */

export interface ViewOnceConsumptionPair {
  readonly messageId: string;
  readonly participantId: string;
}

export interface ViewOnceConsumptionReadPrisma {
  messageStatusEntry: {
    findMany(args: {
      where: { messageId: { in: string[] }; participantId: { in: string[] } };
      select: { messageId: true; participantId: true; viewedOnceAt: true };
      take: number;
    }): Promise<ReadonlyArray<{ messageId: string; participantId: string; viewedOnceAt?: Date | null }>>;
  };
}

export function viewOnceConsumptionKey(pair: ViewOnceConsumptionPair): string {
  return `${pair.messageId}:${pair.participantId}`;
}

/**
 * L'ensemble des couples (message, participant) déjà consommés, en clés
 * `viewOnceConsumptionKey`. UNE lecture, bornée au produit des identifiants
 * demandés : l'unicité `[messageId, participantId]` en fait un plafond exact.
 */
export async function loadViewOnceConsumptions(
  prisma: ViewOnceConsumptionReadPrisma,
  pairs: readonly ViewOnceConsumptionPair[],
  onError?: (error: unknown) => void,
): Promise<ReadonlySet<string>> {
  if (pairs.length === 0) return new Set();
  const wanted = new Set(pairs.map(viewOnceConsumptionKey));
  const messageIds = [...new Set(pairs.map((pair) => pair.messageId))];
  const participantIds = [...new Set(pairs.map((pair) => pair.participantId))];
  try {
    const entries = await prisma.messageStatusEntry.findMany({
      where: { messageId: { in: messageIds }, participantId: { in: participantIds } },
      select: { messageId: true, participantId: true, viewedOnceAt: true },
      take: messageIds.length * participantIds.length,
    });
    return new Set(
      entries
        .filter((entry) => entry.viewedOnceAt instanceof Date)
        .map(viewOnceConsumptionKey)
        .filter((key) => wanted.has(key)),
    );
  } catch (error: unknown) {
    onError?.(error);
    return new Set();
  }
}
