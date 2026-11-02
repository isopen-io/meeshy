package me.meeshy.sdk.model.net

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class AppVersionHeaderTest {

    @Test
    fun `1_10_0 est superieur a 1_9_0 en comparaison numerique`() {
        assertThat(AppVersionHeader.compare("1.10.0", "1.9.0")).isGreaterThan(0)
        assertThat(AppVersionHeader.compare("1.9.0", "1.10.0")).isLessThan(0)
    }

    @Test
    fun `deux versions identiques sont egales`() {
        assertThat(AppVersionHeader.compare("2.0.1", "2.0.1")).isEqualTo(0)
    }

    @Test
    fun `un segment non numerique vaut zero`() {
        assertThat(AppVersionHeader.compare("abc", "0.0.0")).isEqualTo(0)
        assertThat(AppVersionHeader.compare("1.x.3", "1.0.3")).isEqualTo(0)
    }

    @Test
    fun `un segment lit son prefixe numerique`() {
        assertThat(AppVersionHeader.compare("1.2.3-beta", "1.2.3")).isEqualTo(0)
    }

    @Test
    fun `une longueur differente complete par des zeros`() {
        assertThat(AppVersionHeader.compare("1.2", "1.2.0")).isEqualTo(0)
        assertThat(AppVersionHeader.compare("1.2", "1.2.1")).isLessThan(0)
    }

    @Test
    fun `seules les trois premieres composantes comptent`() {
        assertThat(AppVersionHeader.compare("1.2.3.9", "1.2.3.0")).isEqualTo(0)
    }

    @Test
    fun `isBelow compare au plancher`() {
        assertThat(AppVersionHeader.isBelow("1.9.0", floor = "1.10.0")).isTrue()
        assertThat(AppVersionHeader.isBelow("1.10.0", floor = "1.10.0")).isFalse()
    }

    @Test
    fun `un plancher vide ou une version absente ne ferment jamais la porte`() {
        assertThat(AppVersionHeader.isBelow("0.0.1", floor = "")).isFalse()
        assertThat(AppVersionHeader.isBelow(null, floor = "1.0.0")).isFalse()
        assertThat(AppVersionHeader.isBelow("", floor = "1.0.0")).isFalse()
    }

    @Test
    fun `la plateforme annoncee est android`() {
        assertThat(AppVersionHeader.PLATFORM_VALUE).isEqualTo("android")
    }
}
