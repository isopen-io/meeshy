/**
 * LE CORRESPONDANT D'UN TÊTE-À-TÊTE, lu dans le cache (#14592) — synchrone et
 * sans dépendance, pour que le composeur et l'envoi décident sans charger la
 * pile libsignal. Le web chiffre de bout en bout un tête-à-tête seulement :
 * un groupe (Sender Keys, puis MLS) reste refusé, l'interface le disant.
 */
const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** L'autre membre INSCRIT d'un tête-à-tête, `null` pour un groupe, une forme inattendue ou un membre absent. */
export function directPeerOf(conversation: unknown, viewerId: string): string | null {
  if (!isRecord(conversation) || conversation.type !== 'direct' || !Array.isArray(conversation.participants) || viewerId === '') return null;
  const others = conversation.participants.flatMap((participant: unknown) =>
    isRecord(participant) && typeof participant.userId === 'string' && participant.userId !== viewerId ? [participant.userId] : [],
  );
  return others.length === 1 ? (others[0] ?? null) : null;
}

/** La conversation telle que le cache la sert (détail, sinon une page de la liste). */
export function cachedConversation(read: (key: readonly unknown[]) => unknown, conversationId: string): unknown {
  const detail = read(['conversations', conversationId]);
  if (isRecord(detail) && detail.id === conversationId) return detail;
  const list = read(['conversations']);
  const pages = isRecord(list) && Array.isArray(list.pages) ? list.pages : [];
  return pages
    .flatMap((page: unknown) => (isRecord(page) && Array.isArray(page.conversations) ? page.conversations : []))
    .find((row: unknown) => isRecord(row) && row.id === conversationId);
}

/** L'époque du régime servie (`encryptionEpoch`), si la passerelle la sert. */
export function regimeEpochOf(conversation: unknown): number | undefined {
  return isRecord(conversation) && typeof conversation.encryptionEpoch === 'number' && Number.isInteger(conversation.encryptionEpoch) ? conversation.encryptionEpoch : undefined;
}
