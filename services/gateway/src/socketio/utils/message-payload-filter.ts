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
