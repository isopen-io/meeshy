package me.meeshy.sdk.model.relation

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** Le réveil du talkie sur Android (#17144) : le push `talkie_incoming` réveille une fois, et le service suit la prise de parole. */
class TalkieWakeTest {

    private fun wake(vararg extra: Pair<String, String>) =
        mapOf("type" to "talkie_incoming", "talkieId" to "t1", "fromUserId" to "alice") + extra

    @Test
    fun `un push d'un autre type n'est pas un reveil`() {
        assertThat(TalkieWakePushRouter.route(mapOf("type" to "bring", "talkieId" to "t1")))
            .isEqualTo(TalkieWakeRoute.NotATalkieWake)
        assertThat(TalkieWakePushRouter.route(emptyMap())).isEqualTo(TalkieWakeRoute.NotATalkieWake)
    }

    @Test
    fun `un reveil complet porte la prise de parole et le nom servi`() {
        val route = TalkieWakePushRouter.route(wake("fromName" to "  Ada  "))

        assertThat(route).isEqualTo(
            TalkieWakeRoute.Wake(TalkieWakePush(talkieId = "t1", fromUserId = "alice", fromName = "Ada", title = null, body = null)),
        )
    }

    @Test
    fun `un reveil sans identifiant de prise de parole ou d'emetteur est ecarte`() {
        assertThat(TalkieWakePushRouter.route(wake("talkieId" to " ")))
            .isEqualTo(TalkieWakeRoute.Ignore(TalkieWakeRoute.Reason.MALFORMED))
        assertThat(TalkieWakePushRouter.route(mapOf("type" to "talkie_incoming", "talkieId" to "t1")))
            .isEqualTo(TalkieWakeRoute.Ignore(TalkieWakeRoute.Reason.MALFORMED))
    }

    @Test
    fun `une redelivrance du meme reveil ne relance rien`() {
        val route = TalkieWakePushRouter.route(wake()) { it == "t1" }

        assertThat(route).isEqualTo(TalkieWakeRoute.Ignore(TalkieWakeRoute.Reason.DUPLICATE))
    }

    @Test
    fun `le titre servi par la passerelle prime, sinon X vous parle, sinon Quelqu'un`() {
        val fallback = { name: String -> "$name vous parle" }
        val served = (TalkieWakePushRouter.route(wake("title" to "Ada vous parle", "fromName" to "Ada")) as TalkieWakeRoute.Wake).push
        val named = (TalkieWakePushRouter.route(wake("senderName" to "Bo")) as TalkieWakeRoute.Wake).push
        val anonymous = (TalkieWakePushRouter.route(wake()) as TalkieWakeRoute.Wake).push

        assertThat(served.displayTitle(fallback, "Quelqu’un")).isEqualTo("Ada vous parle")
        assertThat(named.displayTitle(fallback, "Quelqu’un")).isEqualTo("Bo vous parle")
        assertThat(anonymous.displayTitle(fallback, "Quelqu’un")).isEqualTo("Quelqu’un vous parle")
    }

    @Test
    fun `le reveil attend l'annonce, suit la voix, puis se sait fini`() {
        val incoming = TalkieIncoming(talkieId = "t1", fromUserId = "alice", startedAt = "2026-11-08T05:00:00Z")
        val waiting = TalkieFloorState()
        val playing = TalkieFloor.open(waiting, incoming, viewerId = "me", nowMs = 0L)
        val done = TalkieFloor.end(playing, TalkieEnded("t1", "alice", "me", "sender")).state

        assertThat(TalkieWakeProgress.of(waiting, "t1")).isEqualTo(TalkieWakeProgress.WAITING)
        assertThat(TalkieWakeProgress.of(playing, "t1")).isEqualTo(TalkieWakeProgress.PLAYING)
        assertThat(TalkieWakeProgress.of(done, "t1")).isEqualTo(TalkieWakeProgress.DONE)
        assertThat(TalkieWakeProgress.of(playing, "t2")).isEqualTo(TalkieWakeProgress.WAITING)
    }

    @Test
    fun `l'attente d'une annonce est bornee au-dela de la duree maximale d'une prise de parole`() {
        assertThat(TalkieWakeProgress.JOIN_TIMEOUT_MS).isGreaterThan(TalkieContract.MAX_DURATION_MS + TALKIE_EXPIRY_GRACE_MS)
    }

    @Test
    fun `Lire rend ouvrable une prise de parole close, et ne touche pas celle qui sort`() {
        val incoming = TalkieIncoming(talkieId = "t1", fromUserId = "alice", startedAt = "2026-11-08T05:00:00Z")
        val playing = TalkieFloor.open(TalkieFloorState(), incoming, viewerId = "me", nowMs = 0L)
        val done = TalkieFloor.end(playing, TalkieEnded("t1", "alice", "me", "sender")).state

        val forgotten = TalkieFloor.forget(done, "t1")
        val reopened = TalkieFloor.open(forgotten, incoming, viewerId = "me", nowMs = 10L)

        assertThat(TalkieWakeProgress.of(reopened, "t1")).isEqualTo(TalkieWakeProgress.PLAYING)
        assertThat(TalkieFloor.forget(playing, "t1")).isEqualTo(playing)
    }
}
