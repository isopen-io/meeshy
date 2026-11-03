package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.socket.SocketAck
import me.meeshy.sdk.model.socket.SocketAckCodes
import me.meeshy.sdk.model.socket.SocketAckRefusal
import org.junit.Test

class SocialReactionOutcomeTest {

    private val minimal = { SocketPostReactionUpdateData(postId = "p1", emoji = "x") }

    @Test
    fun `un accuse accepte confirme avec la charge du serveur`() {
        val event = SocketPostReactionUpdateData(postId = "p1", aggregation = SocketPostReactionAggregation("x", 3))
        assertThat(SocialReactionOutcome.from(SocketAck.Accepted(event), minimal)).isEqualTo(SocialReactionOutcome.Confirmed(event))
    }

    @Test
    fun `une charge illisible est toleree sans agregat pour ne pas effacer le vrai compte`() {
        val outcome = SocialReactionOutcome.from(SocketAck.Accepted(null), minimal) as SocialReactionOutcome.Confirmed
        assertThat(outcome.event.aggregation).isNull()
    }

    @Test
    fun `la limite du jour est un refus distinct`() {
        val refusal = SocketAckRefusal(code = SocketAckCodes.DAILY_REACTION_LIMIT, resetAt = 1_000L)
        val outcome = SocialReactionOutcome.from(SocketAck.Refused(refusal), minimal)
        assertThat((outcome as SocialReactionOutcome.DailyLimit).limit.resetAtEpochMillis).isEqualTo(1_000L)
    }

    @Test
    fun `un autre refus, une absence de socket et une echeance sont distingues`() {
        assertThat(SocialReactionOutcome.from(SocketAck.Refused(SocketAckRefusal(code = "X", message = "m")), minimal))
            .isEqualTo(SocialReactionOutcome.Refused("X", "m"))
        assertThat(SocialReactionOutcome.from(SocketAck.Refused(SocketAckRefusal.NO_SOCKET), minimal)).isEqualTo(SocialReactionOutcome.NoSocket)
        assertThat(SocialReactionOutcome.from(SocketAck.Timeout, minimal)).isEqualTo(SocialReactionOutcome.TimedOut)
    }
}

class PostReactionSyncLawTest {
    private fun post(summary: Map<String, Int>?) = ApiPost(id = "p1", reactionSummary = summary)

    @Test
    fun `l'agregat du serveur remplace le resume local`() {
        val sync = SocketPostReactionSyncData("p1", listOf(SocketPostReactionAggregation("a", 2), SocketPostReactionAggregation("b", 0)))
        assertThat(PostReactionSyncLaw.applying(post(mapOf("a" to 1, "c" to 4)), sync)!!.reactionSummary).containsExactly("a", 2)
    }

    @Test
    fun `un resume deja identique ne change rien`() {
        val sync = SocketPostReactionSyncData("p1", listOf(SocketPostReactionAggregation("a", 2)))
        assertThat(PostReactionSyncLaw.applying(post(mapOf("a" to 2)), sync)).isNull()
    }
}
