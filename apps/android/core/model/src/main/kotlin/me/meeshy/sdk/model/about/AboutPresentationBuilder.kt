package me.meeshy.sdk.model.about

/**
 * Pure Android port of the iOS `AboutView` model: assembles the version label, the information rows
 * (platform / application id / SDK version, each with a blank-safe fallback), the fixed feature list
 * and the launchable-only links from the opaque [AboutParams] the app injects. No Android/UI import.
 */
public object AboutPresentationBuilder {
    public const val PLATFORM_PREFIX: String = "Android"
    public const val DEFAULT_APPLICATION_ID: String = "me.meeshy.android"
    public const val DEFAULT_SDK_VERSION: String = "1.0.0"

    /** The canonical external links, mirroring the iOS About "Liens" section (all https). */
    public val LINKS: List<AboutLink> = listOf(
        AboutLink(AboutLinkKind.WEBSITE, "https://meeshy.me"),
        AboutLink(AboutLinkKind.TWITTER, "https://twitter.com/meeshy"),
        AboutLink(AboutLinkKind.GITHUB, "https://github.com/meeshy"),
    )

    public fun build(params: AboutParams): AboutPresentation =
        AboutPresentation(
            versionLabel = AppVersionFormatter.format(params.versionName, params.versionCode),
            infoRows = listOf(
                AboutInfoRow(AboutInfoKey.PLATFORM, platformLabel(params.osRelease)),
                AboutInfoRow(
                    AboutInfoKey.APPLICATION_ID,
                    params.applicationId.trim().ifBlank { DEFAULT_APPLICATION_ID },
                ),
                AboutInfoRow(
                    AboutInfoKey.SDK_VERSION,
                    params.sdkVersion.trim().ifBlank { DEFAULT_SDK_VERSION },
                ),
            ),
            features = AboutFeatureKey.entries.toList(),
            links = AboutLinkResolver.resolvable(LINKS),
        )

    private fun platformLabel(osRelease: String): String {
        val release = osRelease.trim()
        return if (release.isEmpty()) PLATFORM_PREFIX else "$PLATFORM_PREFIX $release"
    }
}
