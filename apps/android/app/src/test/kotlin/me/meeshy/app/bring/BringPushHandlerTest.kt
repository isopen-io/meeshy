package me.meeshy.app.bring

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.relation.BringRingPush
import org.junit.Test

/**
 * Le Bring reçu sur Android (#13936, `proche-bring@android`) : le push sonne une fois, un arrêt coupe, l'état de
 * sonnerie est la seule source que l'écran plein et le service lisent.
 */
class BringPushHandlerTest {

    private class RecordingRinger : BringRinger {
        val rings = mutableListOf<BringRingPush>()
        val stops = mutableListOf<String>()
        override fun ring(push: BringRingPush) { rings += push }
        override fun stop(bringId: String) { stops += bringId }
    }

    private val now = 1_800_000_000_000L
    private fun iso(millis: Long) = java.time.Instant.ofEpochMilli(millis).toString()
    private fun ring(id: String = "b1") = mapOf(
        "type" to "bring", "bringId" to id, "fromUserId" to "alice", "fromName" to "Alice",
        "sentAt" to iso(now), "expiresAt" to iso(now + 120_000),
    )

    @Test
    fun `un push qui n est pas un Bring n est pas consomme`() {
        val ringer = RecordingRinger()

        assertThat(BringPushHandler(ringer).handle(mapOf("type" to "new_message"), now)).isFalse()
        assertThat(ringer.rings).isEmpty()
    }

    @Test
    fun `une sonnerie sonne une seule fois, meme redelivree`() {
        val ringer = RecordingRinger()
        val handler = BringPushHandler(ringer)

        assertThat(handler.handle(ring(), now)).isTrue()
        assertThat(handler.handle(ring(), now + 3_000)).isTrue()

        assertThat(ringer.rings.map { it.bringId }).containsExactly("b1")
    }

    @Test
    fun `un arret coupe la sonnerie, et une sonnerie qui arrive apres lui ne sonne pas`() {
        val ringer = RecordingRinger()
        val handler = BringPushHandler(ringer)

        assertThat(handler.handle(mapOf("type" to "bring_stopped", "bringId" to "b2", "reason" to "sender"), now)).isTrue()
        assertThat(handler.handle(ring("b2"), now + 1_000)).isTrue()

        assertThat(ringer.stops).containsExactly("b2")
        assertThat(ringer.rings).isEmpty()
    }

    @Test
    fun `l etat de sonnerie ne s arrete que pour le Bring qui sonne`() {
        val state = BringRingState()
        val push = BringRingPush("b1", "alice", "Alice", null, null, null, now + 120_000)
        state.ring(push)

        assertThat(state.stop("autre")).isFalse()
        assertThat(state.current.value).isEqualTo(push)
        assertThat(state.stop("b1")).isTrue()
        assertThat(state.current.value).isNull()
    }
}
