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

const streamCodecMime = (entries: readonly StatsEntry[], mimes: ReadonlyMap<string, string>, type: string): string | null =>
  streamOrder(entries.filter((entry) => entry.type === type && nonEmpty(entry.codecId) !== null)).map((entry) => mimes.get(nonEmpty(entry.codecId) ?? '')).find((mime) => mime !== undefined) ?? null;

/**
 * Le `mimeType` du codec REÇU : le premier `inbound-rtp` de `streamOrder` dont le `codecId` se résout (iOS, Android).
 * Rien de reçu ne se résout (pair muet, flux à sens unique) : le codec ÉMIS, même ordre ; `null` sinon.
 */
export function receivedCodecMime(entries: readonly StatsEntry[]): string | null {
  const mimes = new Map(entries.flatMap((entry): [string, string][] => {
    const mime = textOf(entry.mimeType);
    return entry.type === 'codec' && mime !== null ? [[idOf(entry), mime]] : [];
  }));
  return streamCodecMime(entries, mimes, 'inbound-rtp') ?? streamCodecMime(entries, mimes, 'outbound-rtp');
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

/** Une mesure retenue : un nombre fini et positif ou nul (#20348, #20797). Un 0 est une mesure. */
const validMeasure = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;

/**
 * Une mesure de paire, lue sur la paire élue ; absente d'elle ou aberrante (non numérique, NaN, infinie, négative),
 * sur la première paire de `electionOrder` qui en porte une valide (#20797). Aucune ⇒ `undefined`, et l'appelant passe au repli.
 */
export function pairMeasure(entries: readonly StatsEntry[], elected: StatsEntry | undefined, field: string): number | undefined {
  return [elected, ...electionOrder(entries)].map((entry) => entry?.[field]).find(validMeasure);
}

/** Le `roundTripTime` (s) que rapporte le pair : le premier `remote-inbound-rtp` de `streamOrder` qui en porte un fini et positif ou nul (#20348). */
export function remoteRoundTripTime(entries: readonly StatsEntry[]): number | undefined {
  return streamOrder(entries.filter((entry) => entry.type === 'remote-inbound-rtp')).map((entry) => entry.roundTripTime).find(validMeasure);
}
