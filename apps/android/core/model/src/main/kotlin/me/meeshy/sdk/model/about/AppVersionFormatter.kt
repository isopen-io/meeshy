package me.meeshy.sdk.model.about

/**
 * Pure port of the iOS About `versionString` core: builds the `"name (build)"` fragment from the
 * app's version name + code. i18n-agnostic — the screen wraps this in a localized "Version %s".
 * A blank name degrades to [DEFAULT_VERSION_NAME] and a non-positive code to [DEFAULT_BUILD], so the
 * label is never empty, never `"()"`, and never leaks a non-positive build number.
 */
public object AppVersionFormatter {
    public const val DEFAULT_VERSION_NAME: String = "1.0.0"
    public const val DEFAULT_BUILD: String = "1"

    public fun format(versionName: String, versionCode: Long): String {
        val name = versionName.trim().ifBlank { DEFAULT_VERSION_NAME }
        val build = if (versionCode > 0L) versionCode.toString() else DEFAULT_BUILD
        return "$name ($build)"
    }
}
