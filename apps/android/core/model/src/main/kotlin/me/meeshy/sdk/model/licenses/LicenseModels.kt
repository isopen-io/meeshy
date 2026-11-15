package me.meeshy.sdk.model.licenses

/**
 * The license family a bundled open-source dependency ships under. The declaration order is the
 * rendered group order on the licenses screen (see [OpenSourceLicensePresentationBuilder]); the
 * human label + badge colour for each family is resolved app-side (localized strings /
 * `MeeshyPalette`), keeping this classification pure and testable.
 */
public enum class OpenSourceLicenseType {
    MIT,
    APACHE_2_0,
    BSD,
    OTHER,
}

/**
 * One curated open-source dependency surfaced on the licenses screen. Mirrors the iOS
 * `OpenSourceLicense`, but the catalog itself is Android-accurate (Compose / Coil / OkHttp / Hilt /
 * Socket.IO Java / WebRTC-Android …), not the iOS Swift dependency set.
 */
public data class OpenSourceLicense(
    val name: String,
    val author: String,
    val type: OpenSourceLicenseType,
    val url: String,
)

/** A rendered section of the licenses screen: one [OpenSourceLicenseType] and its ordered entries. */
public data class OpenSourceLicenseGroup(
    val type: OpenSourceLicenseType,
    val licenses: List<OpenSourceLicense>,
)

/** Semantic colour family of a license capsule; the app maps it to a palette colour. */
public enum class LicenseBadge { SUCCESS, WARNING, INFO, NEUTRAL }

/**
 * One tappable card of the licenses screen - one per library. [typeName] is the capsule text for
 * the families whose name is not translatable (MIT, Apache 2.0, BSD); `null` for [OpenSourceLicenseType.OTHER],
 * which the app labels with its localized "Other".
 */
public data class OpenSourceLicenseCard(
    val name: String,
    val author: String,
    val type: OpenSourceLicenseType,
    val typeName: String?,
    val badge: LicenseBadge,
    val url: String,
)
