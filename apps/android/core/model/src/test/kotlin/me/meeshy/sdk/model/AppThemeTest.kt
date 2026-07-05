package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Pure theme-mode logic — the storage codec, the dark-mode resolver, and the
 * tap-to-cycle order. This is the single source of truth the app-level theme
 * and the settings picker both read; it must be total over the enum and robust
 * to any garbage persisted string.
 */
class AppThemeTest {

    @Test
    fun resolveDarkMode_light_isAlwaysLight() {
        assertThat(AppThemeMode.LIGHT.resolveDarkMode(systemInDark = true)).isFalse()
        assertThat(AppThemeMode.LIGHT.resolveDarkMode(systemInDark = false)).isFalse()
    }

    @Test
    fun resolveDarkMode_dark_isAlwaysDark() {
        assertThat(AppThemeMode.DARK.resolveDarkMode(systemInDark = true)).isTrue()
        assertThat(AppThemeMode.DARK.resolveDarkMode(systemInDark = false)).isTrue()
    }

    @Test
    fun resolveDarkMode_auto_followsTheSystem() {
        assertThat(AppThemeMode.AUTO.resolveDarkMode(systemInDark = true)).isTrue()
        assertThat(AppThemeMode.AUTO.resolveDarkMode(systemInDark = false)).isFalse()
    }

    @Test
    fun storageValue_isTheStableSerialName() {
        assertThat(AppThemeMode.LIGHT.storageValue).isEqualTo("light")
        assertThat(AppThemeMode.DARK.storageValue).isEqualTo("dark")
        assertThat(AppThemeMode.AUTO.storageValue).isEqualTo("auto")
    }

    @Test
    fun fromStorage_roundTripsEveryMode() {
        AppThemeMode.entries.forEach { mode ->
            assertThat(appThemeModeFromStorage(mode.storageValue)).isEqualTo(mode)
        }
    }

    @Test
    fun fromStorage_null_defaultsToAuto() {
        assertThat(appThemeModeFromStorage(null)).isEqualTo(AppThemeMode.AUTO)
    }

    @Test
    fun fromStorage_blank_defaultsToAuto() {
        assertThat(appThemeModeFromStorage("")).isEqualTo(AppThemeMode.AUTO)
        assertThat(appThemeModeFromStorage("   ")).isEqualTo(AppThemeMode.AUTO)
    }

    @Test
    fun fromStorage_unknown_defaultsToAuto() {
        assertThat(appThemeModeFromStorage("sepia")).isEqualTo(AppThemeMode.AUTO)
    }

    @Test
    fun fromStorage_isCaseAndWhitespaceInsensitive() {
        assertThat(appThemeModeFromStorage("  DARK ")).isEqualTo(AppThemeMode.DARK)
        assertThat(appThemeModeFromStorage("Light")).isEqualTo(AppThemeMode.LIGHT)
    }

    @Test
    fun fromStorage_acceptsSystemAsAnAliasForAuto() {
        assertThat(appThemeModeFromStorage("system")).isEqualTo(AppThemeMode.AUTO)
        assertThat(appThemeModeFromStorage("SYSTEM")).isEqualTo(AppThemeMode.AUTO)
    }

    @Test
    fun next_cyclesSystemThenLightThenDarkAndWraps() {
        assertThat(AppThemeMode.AUTO.next()).isEqualTo(AppThemeMode.LIGHT)
        assertThat(AppThemeMode.LIGHT.next()).isEqualTo(AppThemeMode.DARK)
        assertThat(AppThemeMode.DARK.next()).isEqualTo(AppThemeMode.AUTO)
    }

    @Test
    fun next_appliedThreeTimes_returnsToStart() {
        AppThemeMode.entries.forEach { start ->
            assertThat(start.next().next().next()).isEqualTo(start)
        }
    }
}
