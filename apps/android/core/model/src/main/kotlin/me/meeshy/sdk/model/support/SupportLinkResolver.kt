package me.meeshy.sdk.model.support

/**
 * Pure gate mirroring the iOS `supportLink`'s `if let URL(string:)` guard: only links with a
 * non-blank, launchable URL are rendered so the app's tap handler always has a resolvable target.
 * Unlike the About screen's website-only links, Help & Support mixes web pages and `mailto:` compose
 * links (support email, bug/feature reports), so `mailto:` is launchable here too. Order is preserved;
 * every other link (blank, or an unsupported scheme) is silently dropped.
 */
public object SupportLinkResolver {

    private val LAUNCHABLE_SCHEMES: List<String> = listOf("http://", "https://", "mailto:")

    public fun resolvable(links: List<SupportLink>): List<SupportLink> =
        links.filter { isLaunchable(it.url) }

    private fun isLaunchable(url: String): Boolean {
        val lower = url.trim().lowercase()
        return LAUNCHABLE_SCHEMES.any { lower.startsWith(it) }
    }
}
