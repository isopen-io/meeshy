package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ConversationClearanceTest {

    @Test
    fun `un mode nul jamais confirme par le serveur est inconnu, pas clair`() {
        assertThat(ConversationClearance.of(sealedInLedger = false, cachedMode = null, servedClearConfirmed = false))
            .isEqualTo(ConversationClearance.UNKNOWN)
        assertThat(ConversationClearance.of(sealedInLedger = false, cachedMode = "  ", servedClearConfirmed = false))
            .isEqualTo(ConversationClearance.UNKNOWN)
    }

    @Test
    fun `un mode nul servi par la passerelle est clair`() {
        assertThat(ConversationClearance.of(false, null, servedClearConfirmed = true)).isEqualTo(ConversationClearance.CLEAR)
    }

    @Test
    fun `un mode serveur ou hybride lu en cache est clair`() {
        assertThat(ConversationClearance.of(false, "server", false)).isEqualTo(ConversationClearance.CLEAR)
        assertThat(ConversationClearance.of(false, "hybrid", false)).isEqualTo(ConversationClearance.CLEAR)
    }

    @Test
    fun `le registre ou le mode e2ee en cache scellent, meme si le serveur l'a servie claire`() {
        assertThat(ConversationClearance.of(true, null, servedClearConfirmed = true)).isEqualTo(ConversationClearance.END_TO_END)
        assertThat(ConversationClearance.of(false, " E2EE ", false)).isEqualTo(ConversationClearance.END_TO_END)
    }

    @Test
    fun `un mode servi nul est clair, servi e2ee est scelle`() {
        assertThat(ConversationClearance.ofServed(null)).isEqualTo(ConversationClearance.CLEAR)
        assertThat(ConversationClearance.ofServed("e2ee")).isEqualTo(ConversationClearance.END_TO_END)
    }
}
