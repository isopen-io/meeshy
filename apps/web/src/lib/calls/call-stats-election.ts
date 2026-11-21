/**
 * **CE QUE `getStats` ÉLIT** (#20256) — le codec reçu, la limitation la plus
 * contraignante et la paire ICE, selon les règles d'iOS et d'Android
 * (`CallStats.swift`, `CallStats.kt`, `CallMediaQuality.kt`) : `RTCStatsReport`
 * est une table, l'ordre de ses entrées n'y décide jamais rien.
 */

export type StatsEntry = Readonly<Record<string, unknown>>;

const idOf = (entry: StatsEntry): string => (typeof entry.id === 'string' ? entry.id : '');

const byId = (a: StatsEntry, b: StatsEntry): number => {
  const left = idOf(a);
  const right = idOf(b);
  return left < right ? -1 : left > right ? 1 : 0;
};

const textOf = (value: unknown): string | null => (typeof value === 'string' ? value : null);

const nonEmpty = (value: unknown): string | null => (typeof value === 'string' && value.length > 0 ? value : null);

/** `CallStatValue.measured` : NaN, l'infini, un négatif ou une absence valent 0. */
const rankValue = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0);

/** Les flux audio d'abord (`kind` absent compte comme audio), puis le plus petit id. */
const streamOrder = (entries: readonly StatsEntry[]): readonly StatsEntry[] => [...entries].sort((a, b) => Number(a.kind === 'video') - Number(b.kind === 'video') || byId(a, b));

/** Le `mimeType` du codec REÇU : le premier `inbound-rtp` de `streamOrder` dont le `codecId` se résout ; `null` sinon. */
export function receivedCodecMime(entries: readonly StatsEntry[]): string | null {
  const mimes = new Map(entries.flatMap((entry): [string, string][] => {
    const mime = textOf(entry.mimeType);
    return entry.type === 'codec' && mime !== null ? [[idOf(entry), mime]] : [];
  }));
  const streams = streamOrder(entries.filter((entry) => entry.type === 'inbound-rtp' && nonEmpty(entry.codecId) !== null));
  return streams.map((entry) => mimes.get(nonEmpty(entry.codecId) ?? '')).find((mime) => mime !== undefined) ?? null;
}

const LIMITATION_RANK: ReadonlyMap<string, number> = new Map([['bandwidth', 3], ['cpu', 2], ['other', 1]]);

const limitationRank = (reason: string): number => LIMITATION_RANK.get(reason) ?? 0;

/** La cause la plus contraignante des `outbound-rtp` vidéo : bandwidth > cpu > other > le reste ; égalité ⇒ plus petit id. */
export function strongestLimitation(entries: readonly StatsEntry[]): string | null {
  const reasoned = entries.flatMap((entry) => {
    const reason = nonEmpty(entry.qualityLimitationReason);
    return entry.type === 'outbound-rtp' && entry.kind === 'video' && reason !== null ? [{ entry, reason }] : [];
  });
  const [strongest] = reasoned.sort((a, b) => limitationRank(b.reason) - limitationRank(a.reason) || byId(a.entry, b.entry));
  return strongest?.reason ?? null;
}

/** Les `candidate-pair` par plus forte `priority`, puis plus petit id. */
const electionOrder = (entries: readonly StatsEntry[]): readonly StatsEntry[] => entries.filter((entry) => entry.type === 'candidate-pair').sort((a, b) => rankValue(b.priority) - rankValue(a.priority) || byId(a, b));

/** La paire élue : celle que nomme le transport de plus petit id, sinon la paire nominée réussie première dans `electionOrder`. */
export function selectedCandidatePair(entries: readonly StatsEntry[]): StatsEntry | undefined {
  const pairs = electionOrder(entries);
  const transports = entries.filter((entry) => entry.type === 'transport').sort(byId);
  const named = transports.map((transport) => pairs.find((entry) => textOf(transport.selectedCandidatePairId) !== null && entry.id === transport.selectedCandidatePairId)).find((entry) => entry !== undefined);
  return named ?? pairs.find((entry) => entry.state === 'succeeded' && entry.nominated === true);
}

/** Une mesure de paire, lue sur la paire élue ; absente d'elle, sur la première paire de `electionOrder` qui la porte. */
export function pairMeasure(entries: readonly StatsEntry[], elected: StatsEntry | undefined, field: string): number | undefined {
  const carried = (entry: StatsEntry | undefined): number | undefined => {
    const value = entry?.[field];
    return typeof value === 'number' ? value : undefined;
  };
  return carried(elected) ?? electionOrder(entries).map(carried).find((value) => value !== undefined);
}
