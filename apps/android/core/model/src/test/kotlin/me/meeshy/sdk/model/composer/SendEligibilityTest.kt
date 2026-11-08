package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.SharedPlace
import org.junit.Test

class SendEligibilityTest {
    private val place = SharedPlace(1.0, 2.0)

    @Test
    fun `texte, piece ou lieu suffisent`() {
        assertThat(SendEligibility.canSend("salut", emptyList(), null)).isTrue()
        assertThat(SendEligibility.canSend("", listOf("a"), null)).isTrue()
        assertThat(SendEligibility.canSend("", emptyList(), place)).isTrue()
    }

    @Test
    fun `vide ou espaces seuls ne s'envoie pas`() {
        assertThat(SendEligibility.canSend("", emptyList(), null)).isFalse()
        assertThat(SendEligibility.canSend(" \n\t ", emptyList(), null)).isFalse()
    }
}
