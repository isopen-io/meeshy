package me.meeshy.sdk.model.relation

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** Le talkie reçu sur Android (#16675) — iso `TalkieCenterTests.swift` : ouvrir, jouer dans l'ordre, fermer, expirer. */
class TalkieFloorTest {

    private val me = "me"
    private val t0 = 1_800_000_000_000L

    private fun incoming(talkieId: String = "t1", from: String = "alice", codec: String = TalkieContract.CODEC, maxMs: Long = 30_000) =
        TalkieIncoming(talkieId = talkieId, fromUserId = from, codec = codec, startedAt = "2026-11-08T05:00:00Z", maxDurationMs = maxMs)

    private fun chunk(seq: Int, talkieId: String = "t1", from: String = "alice") =
        TalkieChunk(talkieId, from, seq, byteArrayOf(seq.toByte(), 1, 2))

    private fun ended(reason: String?, talkieId: String = "t1") = TalkieEnded(talkieId, "alice", me, reason)

    private fun opened(vararg extra: TalkieIncoming): TalkieFloorState =
        (listOf(incoming()) + extra).fold(TalkieFloorState()) { s, i -> TalkieFloor.open(s, i, me, t0) }

    private fun played(steps: List<TalkieStep>) = steps.flatMap { it.sounds }.filterIsInstance<TalkieSound.Play>().map { it.data[0].toInt() }

    private fun feed(state: TalkieFloorState, vararg chunks: TalkieChunk): Pair<TalkieFloorState, List<TalkieStep>> =
        chunks.fold(state to emptyList<TalkieStep>()) { (s, steps), c -> TalkieFloor.receive(s, c).let { it.state to steps + it } }

    @Test
    fun `une prise de parole annoncee s'ouvre, a l'horloge de l'appareil`() {
        val state = opened()
        assertThat(state.active.map { it.talkieId }).containsExactly("t1")
        assertThat(state.active.single().openedAtMs).isEqualTo(t0)
        assertThat(state.active.single().deadlineMs).isEqualTo(t0 + 30_000 + TALKIE_EXPIRY_GRACE_MS)
    }

    @Test
    fun `ma propre voix, un encodage illisible et une annonce en double n'ouvrent rien de plus`() {
        val state = opened(incoming(talkieId = "t2", from = me), incoming(talkieId = "t3", codec = "opus"), incoming())
        assertThat(state.active.map { it.talkieId }).containsExactly("t1")
    }

    @Test
    fun `une duree servie absurde est bornee au contrat`() {
        val state = TalkieFloor.open(TalkieFloorState(), incoming(maxMs = 3_600_000), me, t0)
        assertThat(state.active.single().maxDurationMs).isEqualTo(TalkieContract.MAX_DURATION_MS)
    }

    @Test
    fun `les fragments jouent dans l'ordre, un doublon ou un retard ne joue rien`() {
        val (_, steps) = feed(opened(), chunk(0), chunk(1), chunk(1), chunk(0), chunk(3))
        assertThat(played(steps)).containsExactly(0, 1, 3).inOrder()
    }

    @Test
    fun `un fragment d'un autre emetteur ou d'une prise de parole inconnue ne joue rien`() {
        val (_, steps) = feed(opened(), chunk(0, from = "mallory"), chunk(0, talkieId = "ghost"))
        assertThat(played(steps)).isEmpty()
    }

    @Test
    fun `une fin par l'emetteur laisse finir la file, une coupure fait taire`() {
        val released = TalkieFloor.end(opened(), ended("sender"))
        assertThat(released.sounds).containsExactly(TalkieSound.Release("t1"))
        assertThat(released.state.active).isEmpty()

        val cut = TalkieFloor.end(opened(), ended("cut"))
        assertThat(cut.sounds).containsExactly(TalkieSound.Silence("t1"))
    }

    @Test
    fun `une raison inconnue se lit comme une fin ordinaire`() {
        assertThat(TalkieFloor.end(opened(), ended("moonwalk")).sounds).containsExactly(TalkieSound.Release("t1"))
    }

    @Test
    fun `une prise de parole close ne se rouvre pas et ses fragments en retard se taisent`() {
        val closed = TalkieFloor.end(opened(), ended("sender")).state
        val reopened = TalkieFloor.open(closed, incoming(), me, t0 + 10)
        assertThat(reopened.active).isEmpty()
        assertThat(played(feed(reopened, chunk(5)).second)).isEmpty()
    }

    @Test
    fun `couper fait taire ici, et seulement une prise de parole qui sort`() {
        val muted = TalkieFloor.mute(opened(), "t1")
        assertThat(muted.sounds).containsExactly(TalkieSound.Silence("t1"))
        assertThat(muted.state.active).isEmpty()
        assertThat(TalkieFloor.mute(muted.state, "t1").sounds).isEmpty()
    }

    @Test
    fun `sans fin servie, la prise de parole se ferme passe sa duree et sa marge`() {
        val state = opened()
        val deadline = state.active.single().deadlineMs
        assertThat(TalkieFloor.expireDue(state, deadline - 1).sounds).isEmpty()
        val expired = TalkieFloor.expireDue(state, deadline)
        assertThat(expired.sounds).containsExactly(TalkieSound.Release("t1"))
        assertThat(expired.state.active).isEmpty()
    }

    @Test
    fun `le nom des caches se pose sur la prise de parole qui sort, un nom vide ne l'efface pas`() {
        val named = TalkieFloor.named(opened(), "t1", "Alice")
        assertThat(named.active.single().name).isEqualTo("Alice")
        assertThat(TalkieFloor.named(named, "t1", " ").active.single().name).isEqualTo("Alice")
    }

    @Test
    fun `la memoire des prises de parole closes est bornee`() {
        val state = (0 until TALKIE_CLOSED_CAP + 10).fold(TalkieFloorState()) { s, i ->
            val opened = TalkieFloor.open(s, incoming(talkieId = "t$i"), me, t0)
            TalkieFloor.end(opened, ended("sender", talkieId = "t$i")).state
        }
        assertThat(state.closed).hasSize(TALKIE_CLOSED_CAP)
        assertThat(state.lastSeq).isEmpty()
        assertThat(state.closed.last()).isEqualTo("t${TALKIE_CLOSED_CAP + 9}")
    }
}
