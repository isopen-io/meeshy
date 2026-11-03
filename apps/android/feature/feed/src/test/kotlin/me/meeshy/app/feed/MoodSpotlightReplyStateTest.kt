package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class MoodSpotlightReplyStateTest {

    @Test
    fun `au repos le champ ne peut pas partir vide`() {
        val state = MoodSpotlightUiState(canReply = true, replyText = "  ")
        assertThat(state.canSend).isFalse()
    }

    @Test
    fun `un texte non vide peut partir`() {
        assertThat(MoodSpotlightUiState(canReply = true, replyText = "Bravo").canSend).isTrue()
    }

    @Test
    fun `pendant l envoi le bouton est coupe`() {
        val state = MoodSpotlightUiState(canReply = true, replyText = "Bravo", replyState = MoodReplyState.SENDING)
        assertThat(state.canSend).isFalse()
    }

    @Test
    fun `apres un echec le texte revenu peut repartir`() {
        val state = MoodSpotlightUiState(canReply = true, replyText = "Bravo", replyState = MoodReplyState.FAILED)
        assertThat(state.canSend).isTrue()
    }

    @Test
    fun `sans droit de repondre rien ne part`() {
        assertThat(MoodSpotlightUiState(canReply = false, replyText = "Bravo", replyState = MoodReplyState.SENT).canSend).isFalse()
    }
}
