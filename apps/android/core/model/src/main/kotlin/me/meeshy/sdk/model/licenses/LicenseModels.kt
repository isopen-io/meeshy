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
