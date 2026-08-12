package me.meeshy.app.feed

import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiPostTranslationEntry

/**
 * Adapt a post's `code -> translation` map into the [LanguageResolver.TranslationLike] rows
 * the resolvers ([LanguageResolver.preferredTranslation], the flag-tap resolver) consume.
 *
 * One definition shared by every feed surface — [FeedPostBuilder], [FeedViewModel]'s flag-tap
 * handler and [PostDetailViewModel] — so the projection of a post's translations has a single
 * source of truth rather than a per-file copy.
 */
internal fun Map<String, ApiPostTranslationEntry>?.toTranslationRows():
    List<LanguageResolver.TranslationLike> =
    this?.map { (code, entry) -> PostTranslationRow(code, entry.text) }.orEmpty()

internal data class PostTranslationRow(
    override val targetLanguage: String,
    override val translatedContent: String,
) : LanguageResolver.TranslationLike
