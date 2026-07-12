package me.meeshy.sdk.model.support

/**
 * The four sections of the Help & Support screen, mirroring the iOS `SupportView`
 * (`helpSection` / `contactSection` / `reportSection` / `infoSection`). The label/icon/accent for
 * each key is resolved app-side (localized strings, `MeeshyPalette`); this enum keeps the ordering
 * and classification pure and testable.
 */
public enum class SupportSectionKey {
    HELP,
    CONTACT,
    REPORT,
    INFO,
}

/**
 * A launchable destination surfaced in a Help/Contact/Report section. Mirrors the iOS `supportLink`
 * rows. Both web (`http(s)://`) and `mailto:` targets are valid (iOS opens each via `URL(string:)`).
 */
public enum class SupportLinkKind {
    HELP_CENTER,
    FAQ,
    EMAIL,
    TWITTER,
    BUG_REPORT,
    FEATURE_REQUEST,
}

/** A support link row: its [kind] (label/icon resolved app-side) and the [url] it opens. */
public data class SupportLink(
    val kind: SupportLinkKind,
    val url: String,
)

/** A section of launchable links (HELP / CONTACT / REPORT), already filtered to launchable targets. */
public data class SupportLinkSection(
    val key: SupportSectionKey,
    val links: List<SupportLink>,
)

/** Which fixed information row a value belongs to on the Help & Support screen's INFO section. */
public enum class SupportInfoKey {
    VERSION,
    BUILD,
    PLATFORM,
}

/** A labelled key/value pair rendered in the Help & Support screen's "Information" section. */
public data class SupportInfoRow(
    val key: SupportInfoKey,
    val value: String,
)

/**
 * Opaque platform/build facts the app injects (from `PackageInfo` / `Build`), kept out of the pure
 * core so [SupportPresentationBuilder] has no Android dependency and stays fully unit-testable.
 */
public data class SupportParams(
    val versionName: String,
    val versionCode: Long,
    val osRelease: String,
)

/** The fully-resolved, render-ready Help & Support model. Every decision is made in the builder. */
public data class SupportPresentation(
    val linkSections: List<SupportLinkSection>,
    val infoRows: List<SupportInfoRow>,
)
