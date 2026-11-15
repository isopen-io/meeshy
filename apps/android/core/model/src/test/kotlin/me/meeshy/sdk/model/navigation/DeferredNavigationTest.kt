package me.meeshy.sdk.model.navigation

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.game.engagement.EngagementReveal
import me.meeshy.sdk.model.reading.mode.ConversationReadingMode
import org.junit.Test

class DeferredNavigationTest {
    private fun reply(conversation: String = "c1") = ReplyContextRequest(conversation, "s1", "story")

    @Test
    fun `la recherche demandee se ramasse une seule fois`() {
        val (first, afterFirst) = DeferredNavigation().requestSearch().consumeSearch()
        val (second, _) = afterFirst.consumeSearch()
        assertThat(first).isTrue()
        assertThat(second).isFalse()
    }

    @Test
    fun `le composeur du fil demande se ramasse une seule fois`() {
        val (first, afterFirst) = DeferredNavigation().requestFeedComposer().consumeFeedComposer()
        assertThat(first).isTrue()
        assertThat(afterFirst.consumeFeedComposer().first).isFalse()
    }

    @Test
    fun `chaque pose d'un contexte de reponse incremente sa version`() {
        val state = DeferredNavigation().requestReply(reply()).requestReply(reply())
        assertThat(state.replyContextVersion).isEqualTo(2)
    }

    @Test
    fun `le contexte de reponse ne se ramasse que dans sa conversation`() {
        val state = DeferredNavigation().requestReply(reply("c1"))
        val (stolen, untouched) = state.consumeReply("c2")
        assertThat(stolen).isNull()
        assertThat(untouched).isEqualTo(state)
        val (mine, consumed) = state.consumeReply("c1")
        assertThat(mine).isEqualTo(reply("c1"))
        assertThat(consumed.replyContext).isNull()
        assertThat(consumed.consumeReply("c1").first).isNull()
    }

    @Test
    fun `le saut vers un message est scope a sa conversation et consomme une fois`() {
        val state = DeferredNavigation().requestMessage("m1", "c1")
        assertThat(state.landsOnMessage("c1")).isTrue()
        assertThat(state.landsOnMessage("c2")).isFalse()
        assertThat(state.consumeMessageJump("c2").first).isNull()
        val (id, consumed) = state.consumeMessageJump("c1")
        assertThat(id).isEqualTo("m1")
        assertThat(consumed.landsOnMessage("c1")).isFalse()
    }

    @Test
    fun `un saut non scope vaut pour toute conversation`() {
        val state = DeferredNavigation().requestMessage("m1", null)
        assertThat(state.landsOnMessage("anything")).isTrue()
    }

    @Test
    fun `un identifiant de message vide ne pose aucun saut`() {
        assertThat(DeferredNavigation().requestMessage(" ", "c1").messageJump).isNull()
    }

    @Test
    fun `le mode de lecture force et le palier a celebrer se ramassent une fois`() {
        val reveal = EngagementReveal.Badge("axis", 3)
        val state = DeferredNavigation(forcedReadingMode = ConversationReadingMode.RIVER, engagementReveal = reveal)
        val (mode, afterMode) = state.consumeForcedReadingMode()
        val (palier, afterPalier) = afterMode.consumeEngagementReveal()
        assertThat(mode).isEqualTo(ConversationReadingMode.RIVER)
        assertThat(palier).isEqualTo(reveal)
        assertThat(afterPalier.consumeForcedReadingMode().first).isNull()
        assertThat(afterPalier.consumeEngagementReveal().first).isNull()
    }
}
