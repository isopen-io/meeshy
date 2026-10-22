package me.meeshy.sdk.model.appearance

import kotlinx.serialization.Serializable

/*
 * La gamme de 16 couleurs (#10631, spec § 7) — miroir de
 * `packages/shared/design/appearance/gamut.ts` et de `AppearanceGamut.swift`, lue
 * depuis la copie embarquée du catalogue (`appearance-catalog.json`, gardée
 * identique à la source par un témoin vitest). Une clé = la surface d'un fond uni
 * ET l'accent personnel, en clair et en sombre.
 */

enum class AppearanceScheme {
    LIGHT,
    DARK,
    ;

    companion object {
        fun of(isDark: Boolean): AppearanceScheme = if (isDark) DARK else LIGHT
    }
}

@Serializable
data class AppearanceGamutShade(
    val surface: String,
    val accent: String,
) {
    /** Fail-closed : une teinte qui n'est pas un hexadécimal ne se dessine pas (voir [AppearanceGamutEntry.isReadable]). */
    val isReadable: Boolean
        get() = FrameDecorField.isHex(surface) && FrameDecorField.isHex(accent)
}

@Serializable
data class AppearanceGamutEntry(
    val key: String,
    /** Le nom d'origine du catalogue ; les noms localisés viennent de `AppearanceCatalog.gamutName`. */
    val name: String,
    val light: AppearanceGamutShade,
    val dark: AppearanceGamutShade,
) {
    fun shade(scheme: AppearanceScheme): AppearanceGamutShade = if (scheme == AppearanceScheme.DARK) dark else light

    val isReadable: Boolean
        get() = key.isNotEmpty() && light.isReadable && dark.isReadable
}

data class AppearanceGamut(val entries: List<AppearanceGamutEntry>) {

    fun contains(key: String): Boolean = entries.any { it.key == key }

    fun entry(key: String): AppearanceGamutEntry? = entries.firstOrNull { it.key == key }

    /** `#RRGGBB` du fond uni ; `null` pour une clé hors gamme (jamais fabriqué). */
    fun surface(key: String, scheme: AppearanceScheme): String? = entry(key)?.shade(scheme)?.surface

    /** `#RRGGBB` de l'accent personnel ; `null` pour une clé hors gamme. */
    fun accent(key: String, scheme: AppearanceScheme): String? = entry(key)?.shade(scheme)?.accent

    companion object {
        val EMPTY = AppearanceGamut(emptyList())
    }
}
