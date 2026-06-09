/**
 * Per-recipient language filtering for the `message:new` socket payload
 * (bandwidth sprint Phase B1).
 *
 * The gateway builds ONE message payload carrying every available translation
 * (text + audio/Prisme). Broadcasting it verbatim to a conversation room means
 * a recipient who reads a single language still receives the N-language bundle.
 *
 * `filterMessagePayloadForLanguages` returns a SHALLOW COPY of the payload with:
 *   - `translations[]` (text)            restricted to `languages`
 *   - `attachments[].translations{}`     (audio Prisme) restricted to `languages`
 *
 * It is PURE (never mutates the input) so the same source payload can be
 * filtered once per distinct language group and emitted to each subset. The
 * original content (`content`, `attachments[].transcription`) is always
 * preserved — only the alternate-language translations are trimmed.
 *
 * Matching is case-insensitive. An empty `languages` list returns the payload
 * unchanged (defensive: never strip everything by accident).
 */
export function filterMessagePayloadForLanguages<T extends object>(
  payload: T,
  languages: readonly string[]
): T {
  const langSet = new Set(languages.map((l) => l.toLowerCase()).filter(Boolean));
  if (langSet.size === 0) return payload;

  const source = payload as { translations?: unknown; attachments?: unknown };
  const next = { ...payload } as T & { translations?: unknown; attachments?: unknown };

  if (Array.isArray(source.translations)) {
    next.translations = source.translations.filter(
      (t) => typeof (t as { targetLanguage?: unknown })?.targetLanguage === 'string'
        && langSet.has(((t as { targetLanguage: string }).targetLanguage).toLowerCase())
    );
  }

  if (Array.isArray(source.attachments)) {
    next.attachments = source.attachments.map((att) => {
      const translations = (att as { translations?: unknown })?.translations;
      if (!translations || typeof translations !== 'object' || Array.isArray(translations)) {
        return att;
      }
      const filtered: Record<string, unknown> = {};
      for (const [lang, value] of Object.entries(translations as Record<string, unknown>)) {
        if (langSet.has(lang.toLowerCase())) filtered[lang] = value;
      }
      return { ...(att as Record<string, unknown>), translations: filtered };
    });
  }

  return next;
}

export interface SocketLanguageGroup {
  /** Room socket ids that share the same resolved language set. */
  readonly socketIds: string[];
  /** Languages to keep for this group (recipient langs + original, deduped). */
  readonly languages: string[];
}

export interface GroupSocketsByLanguageOptions {
  readonly socketIds: Iterable<string>;
  /** The message's original language — always kept so the source stays readable. */
  readonly originalLanguage: string;
  readonly socketToUser: (socketId: string) => string | undefined;
  readonly resolveLanguages: (userId: string) => readonly string[] | undefined;
  readonly userLanguage: (userId: string) => string | undefined;
  /** Skip the sender's own user (their devices receive the cid-aware payload). */
  readonly excludeUserId?: string;
  /** Skip specific sockets (e.g. an anonymous sender's own socket). */
  readonly excludeSocketIds?: ReadonlySet<string>;
}

/**
 * Group a room's sockets by their recipient's resolved language set so the
 * trimmed `message:new` payload is emitted once per distinct language group
 * instead of carrying every translation to every socket.
 *
 * PURE: takes lookups, returns groups (no Socket.IO, no I/O) so the grouping is
 * unit-testable in isolation. The message's `originalLanguage` is always added
 * to each group (Prisme: a recipient can always fall back to the source).
 */
export function groupSocketsByLanguage(
  opts: GroupSocketsByLanguageOptions
): SocketLanguageGroup[] {
  const original = opts.originalLanguage.toLowerCase();
  const groups = new Map<string, { socketIds: string[]; languages: string[] }>();

  for (const socketId of opts.socketIds) {
    if (opts.excludeSocketIds?.has(socketId)) continue;
    const userId = opts.socketToUser(socketId);
    if (opts.excludeUserId && userId === opts.excludeUserId) continue;

    const resolved = userId ? opts.resolveLanguages(userId) : undefined;
    const base =
      resolved && resolved.length > 0
        ? resolved.map((l) => l.toLowerCase())
        : [String((userId ? opts.userLanguage(userId) : undefined) || original).toLowerCase()];

    const languages = Array.from(new Set([...base, original]));
    const key = languages.slice().sort().join(',');

    const bucket = groups.get(key);
    if (bucket) bucket.socketIds.push(socketId);
    else groups.set(key, { socketIds: [socketId], languages });
  }

  return Array.from(groups.values());
}
