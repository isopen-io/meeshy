package me.meeshy.sdk.model

/**
 * Prisme Linguistique — progressive translation merge for posts (read side).
 *
 * The map-keyed sibling of [MessageTranslationMerge]. A post reaches the client in
 * its original language; an on-demand translation (the viewer tapped a configured
 * language the post has no content for yet) finishes later. This upserts that
 * translation into a cached [ApiPost.translations] map so the open feed card
 * re-renders in the requested language the instant it lands — no refetch, no reload.
 *
 * Faithful to Rule 1 of the Prisme: only non-blank translations are ever stored (an
 * empty one would make the card claim a translation exists when it does not — see
 * [LanguageResolver] and [me.meeshy.ui.component.bubble.LanguageFlagTapResolver],
 * whose `hasContent` guard treats a blank entry as no content).
 */
public object PostTranslationMerge {

    /**
     * Merge one translation into [post], or return `null` when it is a no-op
     * (nothing to persist):
     *  - a blank [targetLanguage] or blank [translatedText] — the Prisme never
     *    stores an empty translation;
     *  - an identical translation already present (same language, same text).
     *
     * Otherwise the returned copy has its [ApiPost.translations] upserted: an
     * existing entry for [targetLanguage] (matched case-insensitively) is replaced
     * in place under its original key, order preserved; otherwise a new
     * [ApiPostTranslationEntry] is appended under the trimmed [targetLanguage].
     */
    public fun mergeTranslation(
        post: ApiPost,
        targetLanguage: String,
        translatedText: String,
    ): ApiPost? {
        val merged = upsert(post.translations, targetLanguage, translatedText) ?: return null
        return post.copy(translations = merged)
    }

    /**
     * The push-side sibling of the string overload above: merge a whole
     * [ApiPostTranslationEntry] (text plus its model / confidence / timestamp) into
     * [post], or return `null` on a no-op. The realtime `post:translation-updated`
     * event carries a finished entry from the gateway, not a bare string — folding the
     * entry in preserves the metadata the string overload would drop.
     *
     * No-op (`null`) cases: a blank [targetLanguage] or a blank [entry] text (the Prisme
     * never stores an empty translation), or the identical entry already present under
     * that language (matched case-insensitively) — a metadata-only change is NOT a no-op,
     * so richer server data is never silently dropped.
     */
    public fun mergeTranslation(
        post: ApiPost,
        targetLanguage: String,
        entry: ApiPostTranslationEntry,
    ): ApiPost? {
        val merged = upsert(post.translations, targetLanguage, entry) ?: return null
        return post.copy(translations = merged)
    }

    /**
     * The comment-keyed sibling of the post overload above: merge one translation into
     * [comment], or return `null` on the same no-op cases (blank [targetLanguage] or
     * blank [translatedText], or an identical translation already present). Comments
     * carry the same [ApiPostComment.translations] map shape as posts, so both share the
     * one upsert law — a comment translated on demand (the reader tapped a configured
     * language the comment has no content for yet) re-renders the moment it lands.
     */
    public fun mergeTranslation(
        comment: ApiPostComment,
        targetLanguage: String,
        translatedText: String,
    ): ApiPostComment? {
        val merged = upsert(comment.translations, targetLanguage, translatedText) ?: return null
        return comment.copy(translations = merged)
    }

    /**
     * The push-side, comment-keyed sibling of the two overloads above: merge a whole
     * [ApiPostTranslationEntry] (text plus its model / confidence / timestamp) into [comment],
     * or return `null` on a no-op. The realtime `comment:translation-updated` event carries a
     * finished entry from the gateway, not a bare string — folding the entry in preserves the
     * metadata the string overload would drop, exactly as the post entry overload does.
     *
     * No-op (`null`) cases: a blank [targetLanguage] or a blank [entry] text (the Prisme never
     * stores an empty translation), or the identical entry already present under that language
     * (matched case-insensitively) — a metadata-only change is NOT a no-op, so richer server
     * data is never silently dropped.
     */
    public fun mergeTranslation(
        comment: ApiPostComment,
        targetLanguage: String,
        entry: ApiPostTranslationEntry,
    ): ApiPostComment? {
        val merged = upsert(comment.translations, targetLanguage, entry) ?: return null
        return comment.copy(translations = merged)
    }

    /**
     * The shared upsert law over a translations map: trims [targetLanguage], rejects a
     * blank target or [translatedText] and an idempotent match (same language matched
     * case-insensitively, same text) as `null`; otherwise returns the map with the entry
     * replaced in place under its original key (order preserved) or appended under the
     * trimmed target.
     */
    private fun upsert(
        translations: Map<String, ApiPostTranslationEntry>?,
        targetLanguage: String,
        translatedText: String,
    ): Map<String, ApiPostTranslationEntry>? {
        val language = targetLanguage.trim()
        if (language.isEmpty()) return null
        if (translatedText.isBlank()) return null

        val existing = translations.orEmpty()
        val matchKey = existing.keys.firstOrNull { it.equals(language, ignoreCase = true) }
        if (matchKey != null && existing[matchKey]?.text == translatedText) return null

        val entry = ApiPostTranslationEntry(text = translatedText)
        return if (matchKey != null) {
            existing.mapValues { (key, value) -> if (key == matchKey) entry else value }
        } else {
            existing + (language to entry)
        }
    }

    /**
     * The entry-preserving upsert law: trims [targetLanguage], rejects a blank target or a
     * blank [entry] text and an idempotent match (same language matched case-insensitively,
     * the whole entry equal) as `null`; otherwise returns the map with [entry] replacing the
     * matched key in place (order preserved) or appended under the trimmed target. Unlike the
     * string upsert it keeps the entry's model / confidence / timestamp verbatim.
     */
    private fun upsert(
        translations: Map<String, ApiPostTranslationEntry>?,
        targetLanguage: String,
        entry: ApiPostTranslationEntry,
    ): Map<String, ApiPostTranslationEntry>? {
        val language = targetLanguage.trim()
        if (language.isEmpty()) return null
        if (entry.text.isBlank()) return null

        val existing = translations.orEmpty()
        val matchKey = existing.keys.firstOrNull { it.equals(language, ignoreCase = true) }
        if (matchKey != null && existing[matchKey] == entry) return null

        return if (matchKey != null) {
            existing.mapValues { (key, value) -> if (key == matchKey) entry else value }
        } else {
            existing + (language to entry)
        }
    }
}
