// Fixture — la forme que `delivery-queue-door-sweep` doit VOIR : un transport
// qui enfile lui-même, hors de l'unité partagée. C'est la copie inline que le
// chemin REST/ZMQ a portée jusqu'au cycle 116.
export async function enqueueInline(
  deliveryQueue: { enqueue(userId: string, entry: Record<string, unknown>): Promise<void> },
  userId: string,
): Promise<void> {
  await deliveryQueue.enqueue(userId, { messageId: 'm', payload: {} });
}
