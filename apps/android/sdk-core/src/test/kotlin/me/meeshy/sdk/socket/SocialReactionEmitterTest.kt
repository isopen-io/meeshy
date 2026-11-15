package me.meeshy.sdk.socket

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.SocialReactionOutcome
import org.json.JSONObject
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class SocialReactionEmitterTest {

    private class Transport(override var isConnected: Boolean = true, val reply: String?) : AckTransport {
        var event: String? = null
        var sent: JSONObject? = null
        override fun emit(event: String, data: JSONObject, ack: (Array<Any>) -> Unit) {
            this.event = event
            sent = data
            reply?.let { ack(arrayOf(JSONObject(it))) }
        }
    }

    private fun emitter(t: Transport) = SocialReactionEmitter(SocketAckEmitter(t), Json { ignoreUnknownKeys = true; isLenient = true })

    @Test
    fun `la confirmation du serveur porte l'agregat absolu`() = runTest {
        val t = Transport(reply = """{"success":true,"data":{"postId":"p1","userId":"u","emoji":"x","action":"add","aggregation":{"emoji":"x","count":5}}}""")
        val outcome = emitter(t).addPostReaction("p1", "x") as SocialReactionOutcome.Confirmed
        assertThat(outcome.event.aggregation!!.count).isEqualTo(5)
        assertThat(t.event).isEqualTo("post:reaction-add")
        assertThat(t.sent!!.getString("emoji")).isEqualTo("x")
    }

    @Test
    fun `le retrait emet post reaction-remove`() = runTest {
        val t = Transport(reply = """{"success":true}""")
        emitter(t).removePostReaction("p1", "x")
        assertThat(t.event).isEqualTo("post:reaction-remove")
    }

    @Test
    fun `DAILY_REACTION_LIMIT est rendu comme limite du jour pour annuler l'optimiste`() = runTest {
        val t = Transport(reply = """{"success":false,"code":"DAILY_REACTION_LIMIT","resetAt":"2026-11-03T22:00:00.000Z","limit":200}""")
        val outcome = emitter(t).addCommentReaction("c1", "p1", "x")
        assertThat(outcome).isInstanceOf(SocialReactionOutcome.DailyLimit::class.java)
        assertThat((outcome as SocialReactionOutcome.DailyLimit).limit.resetAtEpochMillis).isNotNull()
    }

    @Test
    fun `sans socket le resultat est NoSocket et sans reponse TimedOut n'est pas confondu`() = runTest {
        assertThat(emitter(Transport(isConnected = false, reply = null)).addPostReaction("p1", "x")).isEqualTo(SocialReactionOutcome.NoSocket)
    }

    @Test
    fun `la resynchronisation d'un commentaire lit l'agregat`() = runTest {
        val t = Transport(reply = """{"success":true,"data":{"commentId":"c1","postId":"p1","reactions":[{"emoji":"x","count":2}],"totalCount":2,"userReactions":["x"]}}""")
        val outcome = emitter(t).requestCommentReactionSync("c1") as SocialReactionOutcome.Confirmed
        assertThat(outcome.event.totalCount).isEqualTo(2)
        assertThat(t.event).isEqualTo("comment:reaction-request-sync")
    }
}
