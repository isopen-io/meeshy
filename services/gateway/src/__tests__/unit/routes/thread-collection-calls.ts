/**
 * Les lectures de COLLECTE du fil (`replyToId: { in: … }`) — les seules que les
 * témoins de la route des fils comptent. Depuis #8630 la route remonte aussi la
 * chaîne CITÉE de ce qu'elle sert (`id: { in: … }`), une lecture qui ne collecte rien.
 */
export const threadCollectionCalls = (prisma: any): number =>
  prisma.message.findMany.mock.calls.filter(([args]: any[]) => args?.where?.replyToId !== undefined).length;
