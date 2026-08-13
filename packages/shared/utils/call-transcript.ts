/**
 * Journal de transcription d'appel — source unique du format et de la fusion.
 *
 * Chaque segment de transcription à la volée est journalisé des deux côtés de
 * l'appel sous la forme `displayName (HH:MM): message`, avec le tag de la
 * langue de transcription (`language`). Un même segment peut arriver par deux
 * transports (data channel WebRTC P2P d'abord, relais serveur traduit
 * ensuite) : la fusion se fait par clé stable (`id` du wire, sinon clé
 * synthétique locuteur+bornes) et la traduction vient enrichir la ligne déjà
 * journalisée sans jamais écraser le texte original ni le tag de langue.
 */

export type CallTranscriptJournalEntry = {
  readonly id: string;
  readonly speakerId: string;
  readonly displayName: string;
  readonly text: string;
  readonly translatedText?: string;
  /** Langue dans laquelle le segment a été transcrit (tag automatique). */
  readonly language: string;
  /** Langue de la traduction quand `translatedText` est présent. */
  readonly targetLanguage?: string;
  /** Horloge murale de capture (epoch ms), clé d'ordre du journal. */
  readonly capturedAtMs: number;
  readonly isFinal: boolean;
};

export type CallTranscriptLineInput = {
  readonly displayName: string;
  readonly capturedAtMs: number;
  readonly text: string;
};

export type CallTranscriptLineOptions = {
  readonly timeZone?: string;
};

export function formatCallTranscriptLine(
  { displayName, capturedAtMs, text }: CallTranscriptLineInput,
  { timeZone }: CallTranscriptLineOptions = {}
): string {
  const time = new Intl.DateTimeFormat('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    ...(timeZone ? { timeZone } : {}),
  }).format(new Date(capturedAtMs));
  return `${displayName} (${time}): ${text}`;
}

export type CallTranscriptKeySource = {
  readonly id?: string;
  readonly speakerId: string;
  readonly startMs: number;
  readonly endMs: number;
};

/**
 * Clé de dédup inter-transports : l'`id` du wire quand le pair l'émet
 * (clients récents), sinon une clé synthétique stable pour les segments des
 * anciens clients qui n'émettent pas encore d'`id`.
 */
export function callTranscriptEntryKey({ id, speakerId, startMs, endMs }: CallTranscriptKeySource): string {
  return id ?? `${speakerId}#${startMs}#${endMs}`;
}

export function upsertCallTranscriptEntry(
  entries: readonly CallTranscriptJournalEntry[],
  incoming: CallTranscriptJournalEntry
): CallTranscriptJournalEntry[] {
  const existing = entries.find((entry) => entry.id === incoming.id);
  const next = existing
    ? entries.map((entry) => (entry.id === incoming.id ? mergeEntries(entry, incoming) : entry))
    : [...entries, incoming];
  return next.sort((a, b) => a.capturedAtMs - b.capturedAtMs);
}

function mergeEntries(
  existing: CallTranscriptJournalEntry,
  incoming: CallTranscriptJournalEntry
): CallTranscriptJournalEntry {
  return {
    ...existing,
    displayName: existing.displayName || incoming.displayName,
    translatedText: incoming.translatedText ?? existing.translatedText,
    targetLanguage: incoming.targetLanguage ?? existing.targetLanguage,
    capturedAtMs: Math.min(existing.capturedAtMs, incoming.capturedAtMs),
    isFinal: existing.isFinal || incoming.isFinal,
  };
}
