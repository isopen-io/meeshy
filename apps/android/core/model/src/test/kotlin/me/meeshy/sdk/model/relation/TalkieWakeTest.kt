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

    @Test
    fun `l'audio porte par le push n'est retenu qu'en HTTPS`() {
        val served = (TalkieWakePushRouter.route(wake("audioUrl" to "https://gate.meeshy.me/a/t1.aac")) as TalkieWakeRoute.Wake).push
        val clear = (TalkieWakePushRouter.route(wake("audioUrl" to "http://evil.example/a.aac")) as TalkieWakeRoute.Wake).push
        val absent = (TalkieWakePushRouter.route(wake()) as TalkieWakeRoute.Wake).push

        assertThat(served.audioUrl).isEqualTo("https://gate.meeshy.me/a/t1.aac")
        assertThat(clear.audioUrl).isNull()
        assertThat(absent.audioUrl).isNull()
    }

    @Test
    fun `Lire ne joue que l'audio de la passerelle configuree`() {
        fun push(url: String) = (TalkieWakePushRouter.route(wake("audioUrl" to url)) as TalkieWakeRoute.Wake).push
        val gateway = "https://gate.meeshy.me"

        assertThat(push("https://gate.meeshy.me/talkie/t1.aac").playableAudio(gateway)).isEqualTo("https://gate.meeshy.me/talkie/t1.aac")
        assertThat(push("https://GATE.meeshy.me:443/talkie/t1.aac").playableAudio(gateway)).isNotNull()
        assertThat(push("https://attaquant.example/faux.aac").playableAudio(gateway)).isNull()
        assertThat(push("https://gate.meeshy.me.attaquant.example/faux.aac").playableAudio(gateway)).isNull()
        assertThat(push("https://gate.meeshy.me:8443/faux.aac").playableAudio(gateway)).isNull()
        assertThat((TalkieWakePushRouter.route(wake()) as TalkieWakeRoute.Wake).push.playableAudio(gateway)).isNull()
    }

    @Test
    fun `le suivi d'une prise de parole close porte la voix en piece jointe et passe la redelivrance du reveil`() {
        val ended = wake(
            "phase" to "ended",
            "audioUrl" to "https://gate.meeshy.me/api/v1/talkie/t1/audio?e=1&t=a",
            "attachmentUrl" to "https://gate.meeshy.me/api/v1/talkie/t1/audio?e=1&t=b",
        )

        val route = TalkieWakePushRouter.route(ended) { it == "t1" }
        val push = (route as TalkieWakeRoute.Wake).push

        assertThat(push.ended).isTrue()
        assertThat(push.audioUrl).isEqualTo("https://gate.meeshy.me/api/v1/talkie/t1/audio?e=1&t=b")
        assertThat(push.deliveryKey).isNotEqualTo("t1")
        assertThat(TalkieWakePushRouter.route(ended) { it == push.deliveryKey }).isEqualTo(TalkieWakeRoute.Ignore(TalkieWakeRoute.Reason.DUPLICATE))
    }

    @Test
    fun `le reveil en direct ignore une piece jointe et n'est pas un suivi`() {
        val push = (TalkieWakePushRouter.route(wake("phase" to "live", "attachmentUrl" to "https://gate.meeshy.me/x")) as TalkieWakeRoute.Wake).push

        assertThat(push.ended).isFalse()
        assertThat(push.audioUrl).isNull()
        assertThat(push.deliveryKey).isEqualTo("t1")
    }
}
