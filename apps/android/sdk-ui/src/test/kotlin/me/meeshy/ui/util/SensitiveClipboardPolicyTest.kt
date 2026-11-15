package me.meeshy.ui.util

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class SensitiveClipboardPolicyTest {

    @Test
    fun `le délai d'effacement est de 30 secondes comme sur iOS`() {
        assertThat(SensitiveClipboardPolicy.CLEAR_DELAY_MS).isEqualTo(30_000L)
    }

    @Test
    fun `on efface quand le presse-papiers porte encore le secret`() {
        assertThat(SensitiveClipboardPolicy.shouldClear("JBSWY3DP", "JBSWY3DP")).isTrue()
    }

    @Test
    fun `on n'efface pas si le contenu a changé entre-temps`() {
        assertThat(SensitiveClipboardPolicy.shouldClear("JBSWY3DP", "autre chose")).isFalse()
    }

    @Test
    fun `on n'efface pas un presse-papiers vide ou illisible`() {
        assertThat(SensitiveClipboardPolicy.shouldClear("JBSWY3DP", null)).isFalse()
    }
}
