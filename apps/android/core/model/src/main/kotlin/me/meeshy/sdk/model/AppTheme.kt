package me.meeshy.sdk.model

/**
 * Pure theme-mode logic for the light/dark/system preference (feature-parity §L).
 *
 * [AppThemeMode] is the persisted appearance choice; these helpers are the single
 * source of truth for
 *  - resolving it to an effective dark/light boolean against the current system
 *    setting ([resolveDarkMode]),
 *  - encoding/decoding it for durable storage ([storageValue] / [appThemeModeFromStorage]),
 *  - and the tap-to-cycle order used by the settings row ([next]).
 *
 * Keeping this off the enum declaration (which lives with the serialization models)
 * and out of every Composable keeps the branchy logic behavioural-test-covered.
 */

/**
 * The effective dark-mode verdict for this preference. `LIGHT`/`DARK` are absolute;
 * `AUTO` defers to the platform's [systemInDark] (`isSystemInDarkTheme()`).
 */
public fun AppThemeMode.resolveDarkMode(systemInDark: Boolean): Boolean = when (this) {
    AppThemeMode.LIGHT -> false
    AppThemeMode.DARK -> true
    AppThemeMode.AUTO -> systemInDark
}

/** The stable persisted token — matches the wire `@SerialName`, so cache and API agree. */
public val AppThemeMode.storageValue: String
    get() = when (this) {
        AppThemeMode.LIGHT -> "light"
        AppThemeMode.DARK -> "dark"
        AppThemeMode.AUTO -> "auto"
    }

/**
 * The next mode when the appearance row is tapped: `AUTO → LIGHT → DARK → AUTO`.
 * Starts from the system default, then the two explicit overrides, then wraps.
 */
public fun AppThemeMode.next(): AppThemeMode = when (this) {
    AppThemeMode.AUTO -> AppThemeMode.LIGHT
    AppThemeMode.LIGHT -> AppThemeMode.DARK
    AppThemeMode.DARK -> AppThemeMode.AUTO
}

/**
 * Decodes a persisted token back into a mode. Trimmed and case-insensitive; the
 * platform-native word `"system"` is accepted as an alias for [AppThemeMode.AUTO].
 * Anything absent, blank, or unrecognised falls back to [AppThemeMode.AUTO] — a
 * corrupt/legacy value can never leave the app in a broken appearance state.
 */
public fun appThemeModeFromStorage(raw: String?): AppThemeMode =
    when (raw?.trim()?.lowercase()) {
        "light" -> AppThemeMode.LIGHT
        "dark" -> AppThemeMode.DARK
        "auto", "system" -> AppThemeMode.AUTO
        else -> AppThemeMode.AUTO
    }
