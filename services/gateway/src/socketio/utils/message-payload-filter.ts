import {
  makeLanguageFilter,
  normalizeLanguageCode,
  normalizeLanguageForDedup,
} from '@meeshy/shared/utils/language-normalize';

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
 * Matching canonicalises BOTH sides via the shared `makeLanguageFilter` SSOT: a
 * legacy region-tagged stored key (`'pt-BR'`) matches a canonical requested code
 * (`'pt'`) instead of being pruned (#5234). An empty `languages` list returns the
 * payload unchanged (defensive: never strip everything by accident).
 */
export function filterMessagePayloadForLanguages<T extends object>(
  payload: T,
  languages: readonly string[]
): T {
  const matchesLanguage = makeLanguageFilter(languages);
  if (!matchesLanguage) return payload;

  const source = payload as { translations?: unknown; attachments?: unknown };
  const next = { ...payload } as T & { translations?: unknown; attachments?: unknown };

  if (Array.isArray(source.translations)) {
    next.translations = source.translations.filter(
      (t) => typeof (t as { targetLanguage?: unknown })?.targetLanguage === 'string'
        && matchesLanguage((t as { targetLanguage: string }).targetLanguage)
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
        if (matchesLanguage(lang)) filtered[lang] = value;
      }
      return { ...(att as Record<string, unknown>), translations: filtered };
    });
  }

  return next;
}

/**
 * Canonicalise un code de langue destinataire vers la forme 2-lettres sous
 * laquelle les traductions sont stockées (`translations[].targetLanguage`,
 * `attachments[].translations{}` — voir {@link filterMessagePayloadForLanguages}).
 *
 * Les destinataires REGISTERED arrivent déjà normalisés (`resolveUserLanguagesOrdered`),
 * mais un participant ANONYME porte un `language` brut persisté verbatim par
 * `AuthHandler` (`'pt-BR'`, `'zh-Hant-HK'`) et n'a AUCUNE `resolvedLanguages` —
 * le repli tombe alors sur cette valeur brute. Sans réduction, le set de langues
 * du groupe contient `'pt-br'`, qui ne matche jamais la clé de traduction `'pt'`
 * : la traduction existante est prunée et le lecteur retombe sur l'original —
 * violation directe du Prisme.
 *
 * On délègue à `normalizeLanguageForDedup` — la SSOT du couple
 * « normalise-ou-replie » employée partout où des codes verbatim sont agrégés
 * ou servent de clé (aperçu de liste, `recipient-language.ts`,
 * `anonymous.ts`). Elle réduit ce que `normalizeLanguageCode` sait réduire et,
 * pour un irréductible, REPLIE sur le sous-tag PRIMAIRE lowercased plutôt que
 * sur la chaîne entière : la clé de groupe reste ainsi région-aveugle pour TOUT
 * code, y compris hors catalogue (`'yue-HK'` → `'yue'`). Le repli historique
 * `.trim().toLowerCase()` laissait un `'yue-HK'` et un `'yue'` former DEUX
 * groupes — deux émissions de charge là où une suffit — la fuite exacte que le
 * cas `'en'`/`'en-US'` interdit. Aucun code plausible n'est droppé (la SSOT ne
 * rend jamais `undefined`) et, la carte de traduction étant à clés catalogue,
 * le matching des langues réelles est inchangé.
 *
 * @see packages/shared/utils/language-normalize.ts — `normalizeLanguageForDedup`
 */
function normalizeGroupLanguage(code: string): string {
  return normalizeLanguageForDedup(code);
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
  const original = normalizeGroupLanguage(opts.originalLanguage);
  const groups = new Map<string, { socketIds: string[]; languages: string[] }>();

  for (const socketId of opts.socketIds) {
    if (opts.excludeSocketIds?.has(socketId)) continue;
    const userId = opts.socketToUser(socketId);
    if (opts.excludeUserId && userId === opts.excludeUserId) continue;

    const resolved = userId ? opts.resolveLanguages(userId) : undefined;
    const base =
      resolved && resolved.length > 0
        ? resolved.map(normalizeGroupLanguage)
        : [normalizeGroupLanguage(String((userId ? opts.userLanguage(userId) : undefined) || original))];

    const languages = Array.from(new Set([...base, original]));
    const key = languages.slice().sort().join(',');

    const bucket = groups.get(key);
    if (bucket) bucket.socketIds.push(socketId);
    else groups.set(key, { socketIds: [socketId], languages });
  }

  return Array.from(groups.values());
}
