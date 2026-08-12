package me.meeshy.sdk.model.support

/**
 * Pure Android port of the iOS `SupportView` model: assembles the three launchable-link sections
 * (Get help / Contact us / Report a problem) and the information rows (version / build / platform),
 * each with a blank-safe fallback, from the opaque [SupportParams] the app injects. No Android/UI
 * import — every branch (link launchability, version/build/platform fallbacks) is unit-testable.
 */
public object SupportPresentationBuilder {
    public const val PLATFORM_PREFIX: String = "Android"
    public const val DEFAULT_VERSION_NAME: String = "1.0.0"
    public const val DEFAULT_BUILD: String = "1"

    /** The Help section links, mirroring the iOS `helpSection` (both https web pages). */
    public val HELP_LINKS: List<SupportLink> = listOf(
        SupportLink(SupportLinkKind.HELP_CENTER, "https://meeshy.me/help"),
        SupportLink(SupportLinkKind.FAQ, "https://meeshy.me/faq"),
    )

    /** The Contact section links, mirroring the iOS `contactSection` (mailto + https). */
    public val CONTACT_LINKS: List<SupportLink> = listOf(
        SupportLink(SupportLinkKind.EMAIL, "mailto:support@meeshy.me"),
        SupportLink(SupportLinkKind.TWITTER, "https://twitter.com/meeshy"),
    )

    /** The Report section links, mirroring the iOS `reportSection` (pre-filled mailto compose links). */
    public val REPORT_LINKS: List<SupportLink> = listOf(
        SupportLink(
            SupportLinkKind.BUG_REPORT,
            "mailto:bugs@meeshy.me?subject=Bug%20Report%20-%20Meeshy%20Android",
        ),
        SupportLink(
            SupportLinkKind.FEATURE_REQUEST,
            "mailto:features@meeshy.me?subject=Feature%20Suggestion%20-%20Meeshy%20Android",
        ),
    )

    public fun build(params: SupportParams): SupportPresentation =
        SupportPresentation(
            linkSections = listOf(
                SupportLinkSection(SupportSectionKey.HELP, SupportLinkResolver.resolvable(HELP_LINKS)),
                SupportLinkSection(SupportSectionKey.CONTACT, SupportLinkResolver.resolvable(CONTACT_LINKS)),
                SupportLinkSection(SupportSectionKey.REPORT, SupportLinkResolver.resolvable(REPORT_LINKS)),
            ),
            infoRows = listOf(
                SupportInfoRow(SupportInfoKey.VERSION, versionLabel(params.versionName)),
                SupportInfoRow(SupportInfoKey.BUILD, buildLabel(params.versionCode)),
                SupportInfoRow(SupportInfoKey.PLATFORM, platformLabel(params.osRelease)),
            ),
        )

    private fun versionLabel(versionName: String): String =
        versionName.trim().ifBlank { DEFAULT_VERSION_NAME }

    private fun buildLabel(versionCode: Long): String =
        if (versionCode > 0L) versionCode.toString() else DEFAULT_BUILD

    private fun platformLabel(osRelease: String): String {
        val release = osRelease.trim()
        return if (release.isEmpty()) PLATFORM_PREFIX else "$PLATFORM_PREFIX $release"
    }
}
