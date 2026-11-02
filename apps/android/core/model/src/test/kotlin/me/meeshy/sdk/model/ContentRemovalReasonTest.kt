package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ContentRemovalReasonTest {

    @Test
    fun `un motif est rogne avant d etre compte`() {
        assertThat(ContentRemovalReason.normalized("  spam  ")).isEqualTo("spam")
    }

    @Test
    fun `un motif trop court apres rognage est refuse`() {
        assertThat(ContentRemovalReason.normalized("  ab  ")).isNull()
        assertThat(ContentRemovalReason.normalized("")).isNull()
    }

    @Test
    fun `les bornes 3 et 500 sont incluses`() {
        assertThat(ContentRemovalReason.normalized("abc")).isEqualTo("abc")
        assertThat(ContentRemovalReason.normalized("a".repeat(500))).hasLength(500)
    }

    @Test
    fun `un motif de 501 caracteres est refuse`() {
        assertThat(ContentRemovalReason.normalized("a".repeat(501))).isNull()
    }
}
