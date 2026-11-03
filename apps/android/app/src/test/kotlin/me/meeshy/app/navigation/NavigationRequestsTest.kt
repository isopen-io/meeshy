package me.meeshy.app.navigation

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.game.engagement.EngagementReveal
import me.meeshy.sdk.model.navigation.ReplyContextRequest
import me.meeshy.sdk.model.reading.mode.ConversationReadingMode
import org.junit.Test

class NavigationRequestsTest {
    private fun requests() = NavigationRequests()

    @Test
    fun `la recherche demandee est servie a un seul hote`() {
        val r = requests().apply { requestSearch() }
        assertThat(r.consumeSearch()).isTrue()
        assertThat(r.consumeSearch()).isFalse()
    }

    @Test
    fun `le composeur du fil demande est servi une fois`() {
        val r = requests().apply { requestFeedComposer() }
        assertThat(r.consumeFeedComposer()).isTrue()
        assertThat(r.consumeFeedComposer()).isFalse()
    }

    @Test
    fun `le contexte de reponse est versionne et reserve a sa conversation`() {
        val r = requests()
        r.requestReply(ReplyContextRequest("c1", "s1", "story"))
        assertThat(r.state.value.replyContextVersion).isEqualTo(1)
        assertThat(r.consumeReply("c2")).isNull()
        assertThat(r.consumeReply("c1")?.targetId).isEqualTo("s1")
        assertThat(r.consumeReply("c1")).isNull()
    }

    @Test
    fun `le saut vers un message est scope puis consomme`() {
        val r = requests().apply { requestMessage("m1", "c1") }
        assertThat(r.landsOnMessage("c1")).isTrue()
        assertThat(r.landsOnMessage("c2")).isFalse()
        assertThat(r.consumeMessageJump("c2")).isNull()
        assertThat(r.consumeMessageJump("c1")).isEqualTo("m1")
        assertThat(r.consumeMessageJump("c1")).isNull()
    }

    @Test
    fun `le mode de lecture force et le palier se ramassent une fois`() {
        val r = requests()
        r.forceReadingMode(ConversationReadingMode.SUMMARY)
        r.requestEngagementReveal(EngagementReveal.Badge("axis", 2))
        assertThat(r.consumeForcedReadingMode()).isEqualTo(ConversationReadingMode.SUMMARY)
        assertThat(r.consumeForcedReadingMode()).isNull()
        assertThat(r.consumeEngagementReveal()).isEqualTo(EngagementReveal.Badge("axis", 2))
        assertThat(r.consumeEngagementReveal()).isNull()
    }
}
