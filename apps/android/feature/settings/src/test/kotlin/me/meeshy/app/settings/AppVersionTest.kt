package me.meeshy.app.settings

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class AppVersionTest {

    @Test
    fun `the version of the installed build is shown as is`() {
        assertThat(AppVersion.display("0.1.0")).isEqualTo("0.1.0")
    }

    @Test
    fun `a padded version is trimmed`() {
        assertThat(AppVersion.display("  0.1.0-beta \n")).isEqualTo("0.1.0-beta")
    }

    @Test
    fun `a missing or blank version shows a dash and never an invented number`() {
        assertThat(AppVersion.display(null)).isEqualTo(AppVersion.UNKNOWN)
        assertThat(AppVersion.display("   ")).isEqualTo(AppVersion.UNKNOWN)
    }
}
