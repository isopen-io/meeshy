package me.meeshy.sdk.model.about

/**
 * Which fixed information row a value belongs to on the About screen. The label/icon for each key is
 * resolved app-side (localized strings, `MeeshyPalette`); this enum keeps the classification pure.
 */
public enum class AboutInfoKey {
    PLATFORM,
    APPLICATION_ID,
    SDK_VERSION,
}

/** A labelled key/value pair rendered in the About screen's "Information" section. */
public data class AboutInfoRow(
    val key: AboutInfoKey,
    val value: String,
)

/** The external destinations surfaced in the About screen's "Links" section. */
public enum class AboutLinkKind {
    WEBSITE,
    TWITTER,
    GITHUB,
}

/** A link row: its [kind] (label/icon resolved app-side) and the [url] it opens via `ACTION_VIEW`. */
public data class AboutLink(
    val kind: AboutLinkKind,
    val url: String,
)

/** The product capabilities highlighted in the About screen's "Features" section. */
public enum class AboutFeatureKey {
    ENCRYPTION,
    TRANSLATION,
    VOICE_CLONING,
    THEMES,
    CLOUD_SYNC,
}

/**
 * Opaque platform/build facts the app injects (from `PackageInfo` / `Build`), kept out of the pure
 * core so [AboutPresentationBuilder] has no Android dependency and stays fully unit-testable.
 */
public data class AboutParams(
    val versionName: String,
    val versionCode: Long,
    val osRelease: String,
    val applicationId: String,
    val sdkVersion: String,
)

/** The fully-resolved, render-ready About model. Every decision is made in [AboutPresentationBuilder]. */
public data class AboutPresentation(
    val versionLabel: String,
    val infoRows: List<AboutInfoRow>,
    val features: List<AboutFeatureKey>,
    val links: List<AboutLink>,
)
