package me.meeshy.sdk.lang

/**
 * Applies the Prisme Linguistique to a conversation row's last-message preview.
 *
 * Third twin of the pair `/CLAUDE.md` names as the source of truth for this rule:
 *  - `resolveLastMessagePreview` (`packages/shared/utils/conversation-helpers.ts`)
 *  - `MeeshyConversation.resolvedLastMessagePreview(preferredLanguages:)`
 *    (`packages/MeeshySDK/Sources/MeeshySDK/Models/CoreModels.swift`)
 *
 * The three clients render the SAME row from the SAME payload — `GET /conversations`
 * ships `lastMessageTranslations` + `lastMessageOriginalLanguage` alongside the raw
 * preview — so any divergence here shows one account two different texts depending on
 * which app it is read from. Any change to this rule touches all three.
 *
 * The prism is ORDERED, and the original language competes at its own RANK — never as
 * a global short-circuit:
 *
 *     for each language L of the reader's prism, in order:
 *       L is the original language  ⇒ the raw preview (the message already IS in L)
 *       a translation exists for L  ⇒ that translation
 *     none  ⇒ the raw preview
 *
 * Writing it the other way — "the original language appears somewhere in the prism ⇒
 * show the original" — silently demotes the reader's PRIMARY language as soon as the
 * original language sits lower in their prism, which the device locale (rank 4)
 * produces mechanically. Prism `["fr", "en"]`, English message, French translation
 * available ⇒ **"Bonjour"**, never "Hello".
 *
 * **Critical Prisme rule #3: never fall back to an arbitrary translation.** No match in
 * the reader's languages means the content is already in one of them, or that nothing
 * was translated — a third language would be worse than the original.
 *
 * The three compared sources — reader languages, original language, map keys — are all
 * canonicalised through the same SSOT ([LanguageCodeNormalizer.normalizeForDedup]:
 * case-folded AND region-stripped), never a bare `lowercase()`. `originalLanguage`
 * arrives raw from the wire and messages written before the write-boundary
 * canonicalisation still carry a region-tagged code (`en-US`, `pt-BR`); compared in
 * lowercase alone, `en-us` never matched the normalised rank `en` and a LOWER-ranked
 * translation won — the exact Prisme violation this resolver fights.
 *
 * @param preview the last message's own text, in its original language.
 * @param preferredLanguages the reader's prism, ORDERED — the output of
 *   [LanguageResolver.preferredContentLanguages], never a hand-rebuilt list.
 */
fun resolveLastMessagePreview(
    preview: String?,
    translations: Map<String, String>?,
    originalLanguage: String?,
    preferredLanguages: List<String>,
): String? {
    if (translations.isNullOrEmpty()) return preview

    val preferred = preferredLanguages
        .filter { it.isNotBlank() }
        .map(LanguageCodeNormalizer::normalizeForDedup)
    if (preferred.isEmpty()) return preview

    val original = originalLanguage?.let(LanguageCodeNormalizer::normalizeForDedup)

    val byCanonicalKey = HashMap<String, String>(translations.size)
    for ((lang, text) in translations) {
        // A present-but-blank entry is not a preview: serving it would replace a
        // readable line with an empty one. The gateway already filters this
        // (`buildLastMessagePreviewTranslations`), but the persisted Room cache holds
        // payloads written by older builds that did not.
        if (text.isBlank()) continue
        byCanonicalKey[LanguageCodeNormalizer.normalizeForDedup(lang)] = text
    }

    for (lang in preferred) {
        if (original != null && lang == original) return preview
        byCanonicalKey[lang]?.let { return it }
    }

    return preview
}
