package me.meeshy.sdk.story

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.net.ApiError
import org.junit.Test

class StoryReactionOutcomeTest {
    private fun outcome(status: Int?, code: String?) = StoryReactionOutcome.of(ApiError("m", code, status))

    @Test
    fun `un 409 de plafond est un refus qui se reconnait`() {
        val refused = outcome(409, "REACTION_LIMIT_REACHED") as StoryReactionOutcome.Refused
        assertThat(refused.isLimitReached).isTrue()
        assertThat(refused.httpStatus).isEqualTo(409)
    }

    @Test
    fun `403 et 404 sont des refus`() {
        assertThat(outcome(403, "HTTP_403")).isInstanceOf(StoryReactionOutcome.Refused::class.java)
        assertThat(outcome(404, "HTTP_404")).isInstanceOf(StoryReactionOutcome.Refused::class.java)
    }

    @Test
    fun `une panne reseau sans reponse est un echec de transport rejouable`() {
        assertThat(outcome(null, "NETWORK")).isInstanceOf(StoryReactionOutcome.TransportFailure::class.java)
    }

    @Test
    fun `un echec de decodage n'est pas rejoue`() {
        assertThat(outcome(null, "PARSE")).isInstanceOf(StoryReactionOutcome.Refused::class.java)
    }
}
