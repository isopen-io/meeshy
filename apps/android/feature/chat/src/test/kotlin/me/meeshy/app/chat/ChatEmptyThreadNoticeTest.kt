package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * #15105 — un fil VIDE dit pourquoi, dans la langue de l'app : jamais le texte d'une exception
 * (« Unable to resolve host … »), et hors ligne, il dit qu'il attend le réseau.
 */
class ChatEmptyThreadNoticeTest {

    private val unresolved = "Unable to resolve host \"gate.staging.meeshy.me\": No address associated with hostname"

    @Test
    fun `an empty thread with no failure has no messages yet`() {
        assertThat(ChatUiState().emptyThreadNotice()).isEqualTo(ChatEmptyThreadNotice.NO_MESSAGES)
    }

    @Test
    fun `an empty thread whose first load failed offline says it waits for the network`() {
        val state = ChatUiState(errorMessage = unresolved, isOffline = true)

        assertThat(state.emptyThreadNotice()).isEqualTo(ChatEmptyThreadNotice.OFFLINE)
    }

    @Test
    fun `an empty thread offline says it waits for the network even before the failure lands`() {
        assertThat(ChatUiState(isOffline = true).emptyThreadNotice()).isEqualTo(ChatEmptyThreadNotice.OFFLINE)
    }

    @Test
    fun `an empty thread whose first load failed online says it could not be loaded, never the raw exception`() {
        val state = ChatUiState(errorMessage = unresolved, isOffline = false)

        assertThat(state.emptyThreadNotice()).isEqualTo(ChatEmptyThreadNotice.UNAVAILABLE)
    }

    @Test
    fun `only a failed thread offers to retry`() {
        assertThat(ChatEmptyThreadNotice.NO_MESSAGES.offersRetry).isFalse()
        assertThat(ChatEmptyThreadNotice.OFFLINE.offersRetry).isTrue()
        assertThat(ChatEmptyThreadNotice.UNAVAILABLE.offersRetry).isTrue()
    }
}
