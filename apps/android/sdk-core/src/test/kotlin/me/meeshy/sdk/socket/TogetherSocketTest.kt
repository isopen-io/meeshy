package me.meeshy.sdk.socket

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestCoroutineScheduler
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.relation.TogetherEndReason
import me.meeshy.sdk.model.relation.TogetherEvents
import me.meeshy.sdk.model.relation.TogetherInbound
import me.meeshy.sdk.model.relation.TogetherInviteOutcome
import me.meeshy.sdk.model.relation.TogetherJoinOutcome
import me.meeshy.sdk.model.relation.TogetherMediaKind
import org.json.JSONObject
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** « Ensemble » sur la socket Android (#17100) — iso `TogetherTests.swift` (SDK iOS). */
@RunWith(RobolectricTestRunner::class)
class TogetherSocketTest {
    private val scheduler = TestCoroutineScheduler()
    private val playback = """{"playing":true,"positionMs":1200,"at":1700000000000,"rev":3,"byUserId":"u1"}"""

    private fun wired(fake: FakeCallSocket = FakeCallSocket()): TogetherSocket {
        val router = SocketEventRouter(SocketEventRegistrar { event, callback -> fake.socket.on(event, callback) }, StandardTestDispatcher(scheduler))
        return TogetherSocket(router, fake.socket).also { it.attach() }
    }

    @Test
    fun `les quatre evenements serveur sont ecoutes, aucun evenement client`() {
        val fake = FakeCallSocket()
        wired(fake)
        assertThat(fake.handlers.keys.filter { it.startsWith("together:") })
            .containsExactly(TogetherEvents.INVITED, TogetherEvents.STARTED, TogetherEvents.SYNCED, TogetherEvents.ENDED)
    }

    @Test
    fun `les evenements recus arrivent dans l'ordre du fil, une charge illisible ne produit rien`() = runTest {
        val fake = FakeCallSocket()
        val socket = wired(fake)
        socket.events.test {
            fake.deliver(
                TogetherEvents.STARTED,
                """{"sessionId":"s1","hostUserId":"u1","guestUserId":"u2","conversationId":"c1","attachmentId":"a1","media":"video","playback":$playback}""",
            )
            fake.deliver(TogetherEvents.SYNCED, """{"sessionId":"s1"}""")
            fake.deliver(TogetherEvents.SYNCED, """{"sessionId":"s1","playback":$playback}""")
            fake.deliver(TogetherEvents.ENDED, """{"sessionId":"s1","reason":"left","endedAt":"2026-11-13T15:00:00Z"}""")
            scheduler.advanceUntilIdle()
            assertThat((awaitItem() as TogetherInbound.Started).data.media).isEqualTo(TogetherMediaKind.VIDEO)
            assertThat((awaitItem() as TogetherInbound.Synced).data.playback.rev).isEqualTo(3)
            assertThat((awaitItem() as TogetherInbound.Ended).data.reason).isEqualTo(TogetherEndReason.LEFT)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `inviter porte les trois identifiants et lit l'accuse`() = runTest {
        val fake = FakeCallSocket(ackReply = JSONObject("""{"success":true,"data":{"sessionId":"s1","media":"audio"}}"""))
        val outcome = wired(fake).invite("u2", "c1", "a1")
        assertThat(outcome).isEqualTo(TogetherInviteOutcome.Invited("s1", TogetherMediaKind.AUDIO))
        val sent = fake.last(TogetherEvents.INVITE)
        assertThat(sent.keys().asSequence().toSet()).containsExactly("toUserId", "conversationId", "attachmentId")
    }

    @Test
    fun `un refus se dit par son issue, une socket absente rend hors ligne sans rien emettre`() = runTest {
        val refused = FakeCallSocket(ackReply = JSONObject("""{"success":false,"error":"x","code":"TOGETHER_RATE_LIMITED"}"""))
        assertThat(wired(refused).invite("u2", "c1", "a1")).isEqualTo(TogetherInviteOutcome.RateLimited)

        val offline = FakeCallSocket(connected = false)
        val socket = wired(offline)
        assertThat(socket.invite("u2", "c1", "a1")).isEqualTo(TogetherInviteOutcome.Offline)
        assertThat(socket.join("s1")).isEqualTo(TogetherJoinOutcome.Offline)
        assertThat(socket.sync("s1", true, 10.0)).isNull()
        socket.leave("s1")
        assertThat(offline.emitted).isEmpty()
    }

    @Test
    fun `rejoindre rend la seance commencee, une invitation perimee se dit partie`() = runTest {
        val joined = FakeCallSocket(
            ackReply = JSONObject(
                """{"success":true,"data":{"sessionId":"s1","hostUserId":"u1","guestUserId":"u2","conversationId":"c1","attachmentId":"a1","media":"audio","playback":$playback}}""",
            ),
        )
        assertThat((wired(joined).join("s1") as TogetherJoinOutcome.Joined).started.sessionId).isEqualTo("s1")
        assertThat(joined.last(TogetherEvents.JOIN).getString("sessionId")).isEqualTo("s1")

        val gone = FakeCallSocket(ackReply = JSONObject("""{"success":false,"error":"x","code":"TOGETHER_NOT_FOUND"}"""))
        assertThat(wired(gone).join("s1")).isEqualTo(TogetherJoinOutcome.Gone)
    }

    @Test
    fun `synchroniser envoie une position entiere et rend l'etat retenu par le serveur`() = runTest {
        val fake = FakeCallSocket(ackReply = JSONObject("""{"success":true,"data":{"playback":$playback}}"""))
        val kept = wired(fake).sync("s1", playing = true, positionMs = 1199.7)
        assertThat(kept?.rev).isEqualTo(3)
        assertThat(fake.last(TogetherEvents.SYNC).getInt("positionMs")).isEqualTo(1200)
    }

    @Test
    fun `quitter emet la seance sans attendre d'accuse`() = runTest {
        val fake = FakeCallSocket()
        wired(fake).leave("s1")
        assertThat(fake.last(TogetherEvents.LEAVE).getString("sessionId")).isEqualTo("s1")
    }
}
