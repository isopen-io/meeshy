package me.meeshy.sdk.model.about

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * [AppVersionFormatter] is the pure port of the iOS About `versionString` core: it builds the
 * `"name (build)"` fragment the screen wraps in a localized "Version %s". These tests pin every
 * degrade branch so the label is never empty, never `"()"`, and never leaks a non-positive build.
 */
class AppVersionFormatterTest {

    @Test
    fun format_nominalNameAndCode_joinsNameAndBuild() {
        assertThat(AppVersionFormatter.format("2.3.1", 42L)).isEqualTo("2.3.1 (42)")
    }

    @Test
    fun format_blankName_fallsBackToDefaultVersionName() {
        assertThat(AppVersionFormatter.format("   ", 7L)).isEqualTo("1.0.0 (7)")
    }

    @Test
    fun format_emptyName_fallsBackToDefaultVersionName() {
        assertThat(AppVersionFormatter.format("", 7L)).isEqualTo("1.0.0 (7)")
    }

    @Test
    fun format_paddedName_isTrimmed() {
        assertThat(AppVersionFormatter.format("  1.5  ", 9L)).isEqualTo("1.5 (9)")
    }

    @Test
    fun format_zeroCode_fallsBackToDefaultBuild() {
        assertThat(AppVersionFormatter.format("1.0.0", 0L)).isEqualTo("1.0.0 (1)")
    }

    @Test
    fun format_negativeCode_fallsBackToDefaultBuild() {
        assertThat(AppVersionFormatter.format("1.0.0", -3L)).isEqualTo("1.0.0 (1)")
    }

    @Test
    fun format_bothDegraded_usesBothDefaults() {
        assertThat(AppVersionFormatter.format("", 0L))
            .isEqualTo("${AppVersionFormatter.DEFAULT_VERSION_NAME} (${AppVersionFormatter.DEFAULT_BUILD})")
    }
}
