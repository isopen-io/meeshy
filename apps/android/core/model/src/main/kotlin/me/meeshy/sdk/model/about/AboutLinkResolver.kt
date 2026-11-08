package me.meeshy.sdk.model.about

/**
 * Pure gate mirroring the iOS `linkRow`'s `if let URL(string:)` guard: only links with a non-blank,
 * http(s) URL are rendered, so an `Intent.ACTION_VIEW` always has a launchable target. Order is
 * preserved; every other link (blank, or a non-http(s) scheme) is silently dropped.
 */
public object AboutLinkResolver {
    public fun resolvable(links: List<AboutLink>): List<AboutLink> =
        links.filter { isLaunchable(it.url) }

    /**
     * Ouvre [link] par [launch] s'il est lançable ; `false` (jamais d'exception) quand le lien est
     * refusé ou que l'appareil n'a aucun navigateur : l'écran reste debout, comme `Link` sur iOS.
     */
    public fun launchOrFallback(link: AboutLink, launch: (String) -> Unit): Boolean {
        if (!isLaunchable(link.url)) return false
        return runCatching { launch(link.url) }.isSuccess
    }

    private fun isLaunchable(url: String): Boolean {
        val lower = url.trim().lowercase()
        return lower.startsWith("http://") || lower.startsWith("https://")
    }
}
