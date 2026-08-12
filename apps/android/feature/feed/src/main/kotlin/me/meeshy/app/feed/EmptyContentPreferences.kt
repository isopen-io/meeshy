package me.meeshy.app.feed

import me.meeshy.sdk.lang.LanguageResolver

/**
 * The neutral content-language preferences used to project posts for an anonymous
 * session (no signed-in user). Shared by the feed and saved-posts view models so the
 * "no preferences" fallback has a single definition (SSOT).
 */
internal object EmptyContentPreferences : LanguageResolver.ContentLanguagePreferences {
    override val systemLanguage: String? = null
    override val regionalLanguage: String? = null
    override val customDestinationLanguage: String? = null
}
