package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.call.group.GroupCallArrival
import me.meeshy.sdk.model.call.group.GroupCallDirectory
import me.meeshy.sdk.model.call.group.GroupCallTitle
import me.meeshy.sdk.model.call.group.GroupCallLinkState
import org.junit.Test

/**
 * Le maillage d'un appel de groupe (#13740), même topologie qu'iOS `GroupCallMeshCoordinator` : le membre déjà
 * dans l'appel offre au nouveau venu, le nouveau venu répond, le principal reste à la connexion de l'appel, et un
 * duo ne traverse jamais le maillage. Les connexions WebRTC sont remplacées par des faux ; aucun natif ne tourne.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class GroupCallMeshTest {

    @Test
    fun `a duo never goes through the mesh`() = runTest(UnconfinedTestDispatcher()) {
        val h = Harness()
        h.bind(this, isOutgoing = false)
        assertThat(h.signal("offer", from = "alice")).isFalse()
        assertThat(h.signal("ice-candidate", from = "alice", sdp = null)).isFalse()
        assertThat(h.mesh.claimsArrival("alice")).isFalse()
        assertThat(h.mesh.ui.value.isActive).isFalse()
        assertThat(h.opened).isEmpty()
        h.mesh.teardown()
    }

    @Test
    fun `the caller's first joiner is the primary, the next one gets a mesh offer addressed to it`() = runTest(UnconfinedTestDispatcher()) {
        val h = Harness()
        h.bind(this, isOutgoing = true)
        assertThat(h.mesh.claimsArrival("alice")).isFalse()
        assertThat(h.mesh.claimsArrival("bob")).isTrue()
        assertThat(h.sent.single()).isEqualTo(Sent("bob", "m", GroupMeshSignal(GroupMeshSignalKind.Offer, sdp = "v=0 offer", negotiationId = 1)))
        assertThat(h.mesh.ui.value.isActive).isTrue()
        assertThat(h.mesh.ui.value.roster.members.map { it.userId to it.isPrimary }).containsExactly("alice" to true, "bob" to false).inOrder()
        assertThat(h.signal("answer", from = "alice")).isFalse()
        h.mesh.teardown()
    }

    @Test
    fun `the callee's first offerer is the primary, a second offerer is answered by the mesh`() = runTest(UnconfinedTestDispatcher()) {
        val h = Harness()
        h.bind(this, isOutgoing = false, self = "m")
        assertThat(h.signal("offer", from = "alice")).isFalse()
        assertThat(h.signal("offer", from = "bob", negotiationId = 4)).isTrue()
        assertThat(h.opened.single().calls).containsExactly("remote-offer", "answer", "local-answer").inOrder()
        assertThat(h.sent.single()).isEqualTo(Sent("bob", "m", GroupMeshSignal(GroupMeshSignalKind.Answer, sdp = "v=0 answer", negotiationId = 4)))
        assertThat(h.signal("ice-candidate", from = "bob", negotiationId = 4, sdp = null)).isTrue()
        assertThat(h.signal("offer", from = "alice", negotiationId = 2)).isFalse()
        h.mesh.teardown()
    }

    @Test
    fun `my own echo is swallowed once the call is a group`() = runTest(UnconfinedTestDispatcher()) {
        val h = Harness()
        h.bind(this, isOutgoing = true)
        h.mesh.claimsArrival("alice")
        h.mesh.claimsArrival("bob")
        assertThat(h.signal("offer", from = "m")).isTrue()
        h.mesh.teardown()
    }

    @Test
    fun `a member that leaves closes its link, the call goes on`() = runTest(UnconfinedTestDispatcher()) {
        val h = Harness()
        h.bind(this, isOutgoing = true)
        h.mesh.claimsArrival("alice")
        h.mesh.claimsArrival("bob")
        h.mesh.onParticipantLeft(CALL, "bob")
        assertThat(h.opened.single().closed).isTrue()
        assertThat(h.mesh.ui.value.roster.members.map { it.userId }).containsExactly("alice")
        h.mesh.teardown()
    }

    @Test
    fun `the primary leaving a group that carries on vacates its seat, alone it ends the call as before`() = runTest(UnconfinedTestDispatcher()) {
        val h = Harness()
        h.bind(this, isOutgoing = true)
        h.mesh.claimsArrival("alice")
        assertThat(h.mesh.primaryDidLeave()).isFalse()
        h.mesh.claimsArrival("bob")
        h.mesh.onParticipantLeft(CALL, "alice")
        assertThat(h.mesh.isPrimaryVacated).isTrue()
        assertThat(h.signal("offer", from = "alice", negotiationId = 9)).isTrue()
        h.mesh.teardown()
    }

    @Test
    fun `a mesh member's media toggle stays off the primary's indicators`() = runTest(UnconfinedTestDispatcher()) {
        val h = Harness()
        h.bind(this, isOutgoing = true)
        h.mesh.claimsArrival("alice")
        assertThat(h.mesh.onMediaToggled(CALL, "alice", "audio", enabled = false)).isFalse()
        h.mesh.claimsArrival("bob")
        assertThat(h.mesh.onMediaToggled(CALL, "bob", "video", enabled = true)).isTrue()
        assertThat(h.mesh.onMediaToggled(CALL, "alice", "audio", enabled = false)).isFalse()
        assertThat(h.mesh.ui.value.roster.member("bob")!!.isCameraOn).isTrue()
        h.mesh.teardown()
    }

    @Test
    fun `a full call admits nobody more, without offering`() = runTest(UnconfinedTestDispatcher()) {
        val h = Harness()
        h.bind(this, isOutgoing = true)
        listOf("a1", "b1", "c1", "d1", "e1").forEach { h.mesh.claimsArrival(it) }
        val links = h.opened.size
        assertThat(h.mesh.claimsArrival("f1")).isTrue()
        assertThat(h.opened.size).isEqualTo(links)
        assertThat(h.mesh.ui.value.roster.member("f1")).isNull()
        h.mesh.teardown()
    }

    @Test
    fun `arrival details name a member, and the microphone follows on every link`() = runTest(UnconfinedTestDispatcher()) {
        val h = Harness()
        h.bind(this, isOutgoing = true)
        h.mesh.claimsArrival("alice")
        h.mesh.claimsArrival("bob")
        h.mesh.onArrivalDetails(CALL, GroupCallArrival("bob", displayName = "Bob"))
        h.mesh.setSendsAudio(false)
        assertThat(h.mesh.ui.value.roster.member("bob")!!.displayName).isEqualTo("Bob")
        assertThat(h.opened.single().sendsAudio).isFalse()
        h.mesh.teardown()
    }

    @Test
    fun `the impolite side ignores a colliding offer, the polite side rolls back and answers`() = runTest(UnconfinedTestDispatcher()) {
        val impolite = Harness()
        impolite.bind(this, isOutgoing = true, self = "z9")
        impolite.mesh.claimsArrival("alice")
        impolite.mesh.claimsArrival("bob")
        impolite.opened.single().stable = false
        assertThat(impolite.signal("offer", from = "bob", negotiationId = 1)).isTrue()
        assertThat(impolite.opened.single().calls).doesNotContain("rollback")
        impolite.mesh.teardown()

        val polite = Harness()
        polite.bind(this, isOutgoing = true, self = "a0")
        polite.mesh.claimsArrival("alice")
        polite.mesh.claimsArrival("bob")
        polite.opened.single().stable = false
        polite.signal("offer", from = "bob", negotiationId = 1)
        assertThat(polite.opened.single().calls).containsAtLeast("rollback", "remote-offer", "answer").inOrder()
        polite.mesh.teardown()
    }

    @Test
    fun `a link whose restarts run out drops its member, the call goes on`() = runTest {
        val h = Harness()
        h.bind(this, isOutgoing = true)
        h.mesh.claimsArrival("alice")
        h.mesh.claimsArrival("bob")
        testScheduler.advanceUntilIdle()
        val port = h.opened.single()
        port.callbacks.onState(GroupMeshPeerState.Connected)
        testScheduler.advanceUntilIdle()
        assertThat(h.mesh.ui.value.roster.member("bob")!!.link).isEqualTo(GroupCallLinkState.Connected)
        repeat(6) {
            port.callbacks.onState(GroupMeshPeerState.Failed)
            testScheduler.advanceUntilIdle()
        }
        assertThat(port.calls.count { it == "offer-restart" }).isEqualTo(5)
        assertThat(h.mesh.ui.value.roster.member("bob")).isNull()
        assertThat(port.closed).isTrue()
        h.mesh.teardown()
    }

    /** Un annuaire qu'on fait parler à la main, et qui compte ses lectures. */
    private class FakeNames(private val groupConversations: Set<String> = emptySet()) : GroupCallNameSource {
        val reads = mutableListOf<Pair<String, String>>()
        val directories = MutableSharedFlow<GroupCallDirectory>(replay = 0, extraBufferCapacity = 4)
        override fun directoryFor(conversationId: String, callId: String): Flow<GroupCallDirectory> {
            reads += conversationId to callId
            return directories
        }
        override suspend fun isGroupConversation(conversationId: String): Boolean = conversationId in groupConversations
    }

    private fun named(vararg names: Pair<String, String>, groupTitle: String? = null, present: Set<String> = emptySet()) =
        GroupCallDirectory(groupTitle, names.associate { (id, name) -> id to GroupCallArrival(id, displayName = name) }, present)

    @Test
    fun `a member known only by its offer is named by the directory, read once per call`() = runTest(UnconfinedTestDispatcher()) {
        val names = FakeNames()
        val h = Harness(names = names)
        h.bind(this, isOutgoing = false)
        h.signal("offer", from = "alice")
        h.signal("offer", from = "bob", negotiationId = 4)
        assertThat(h.mesh.ui.value.roster.member("bob")!!.displayName).isEmpty()

        names.directories.emit(named("alice" to "Alice", "bob" to "Bob", "cleo" to "Cléo"))
        assertThat(h.mesh.ui.value.roster.members.map { it.displayName }).containsExactly("Alice", "Bob").inOrder()

        h.signal("offer", from = "cleo", negotiationId = 2)
        assertThat(h.mesh.ui.value.roster.member("cleo")!!.displayName).isEqualTo("Cléo")
        assertThat(names.reads).containsExactly(CONVERSATION to CALL)
        h.mesh.teardown()
    }

    @Test
    fun `a call in a group conversation reads its names at the ring, once, and names the members as the group proves itself`() =
        runTest(UnconfinedTestDispatcher()) {
            val names = FakeNames(groupConversations = setOf(CONVERSATION))
            val h = Harness(names = names)
            h.bind(this, isOutgoing = false)
            assertThat(names.reads).containsExactly(CONVERSATION to CALL)

            names.directories.emit(named("alice" to "Alice", "bob" to "Bob"))
            h.signal("offer", from = "alice")
            h.signal("offer", from = "bob", negotiationId = 4)

            assertThat(h.mesh.ui.value.roster.members.map { it.displayName }).containsExactly("Alice", "Bob").inOrder()
            assertThat(names.reads).containsExactly(CONVERSATION to CALL)
            h.mesh.teardown()
        }

    @Test
    fun `a direct or unknown conversation waits for the group to prove itself before reading`() = runTest(UnconfinedTestDispatcher()) {
        val names = FakeNames()
        val h = Harness(names = names)
        h.bind(this, isOutgoing = false)
        assertThat(names.reads).isEmpty()

        h.signal("offer", from = "alice")
        h.signal("offer", from = "bob", negotiationId = 4)
        assertThat(names.reads).containsExactly(CONVERSATION to CALL)
        h.mesh.teardown()
    }

    @Test
    fun `an announced name is never replaced by the directory`() = runTest(UnconfinedTestDispatcher()) {
        val names = FakeNames()
        val h = Harness(names = names)
        h.bind(this, isOutgoing = true)
        h.mesh.claimsArrival("alice")
        h.mesh.claimsArrival("bob")
        h.mesh.onArrivalDetails(CALL, GroupCallArrival("bob", displayName = "Bobby"))
        names.directories.emit(named("bob" to "Bob"))
        assertThat(h.mesh.ui.value.roster.member("bob")!!.displayName).isEqualTo("Bobby")
        h.mesh.teardown()
    }

    @Test
    fun `when the primary leaves the call is named by who remains, or by its group`() = runTest(UnconfinedTestDispatcher()) {
        val names = FakeNames()
        val h = Harness(names = names)
        h.bind(this, isOutgoing = true)
        h.mesh.claimsArrival("alice")
        h.mesh.claimsArrival("bob")
        h.mesh.claimsArrival("cleo")
        names.directories.emit(named("alice" to "Alice", "bob" to "Bob"))
        assertThat(h.mesh.ui.value.title).isNull()

        h.mesh.onParticipantLeft(CALL, "alice")
        assertThat(h.mesh.ui.value.title).isEqualTo(GroupCallTitle.Members(listOf("Bob", ""), more = 0))

        names.directories.emit(named("cleo" to "Cléo", groupTitle = "Famille"))
        assertThat(h.mesh.ui.value.title).isEqualTo(GroupCallTitle.Group("Famille"))
        h.mesh.teardown()
        assertThat(h.mesh.ui.value.title).isNull()
    }

    @Test
    fun `a member the gateway still counts keeps the group going when the primary leaves, a departed one does not`() =
        runTest(UnconfinedTestDispatcher()) {
            val names = FakeNames()
            val h = Harness(names = names)
            h.bind(this, isOutgoing = true)
            h.mesh.claimsArrival("alice")
            h.mesh.claimsArrival("bob")
            h.mesh.onParticipantLeft(CALL, "bob")
            names.directories.emit(named(present = setOf("alice", "bob")))
            assertThat(h.mesh.primaryDidLeave()).isFalse()

            names.directories.emit(named(present = setOf("alice", "dan")))
            assertThat(h.mesh.primaryDidLeave()).isTrue()
            h.mesh.teardown()
        }

    private fun TestScope.callerTrio(): Harness {
        val h = Harness(clock = { testScheduler.currentTime }, samplingMillis = 400)
        h.bind(this, isOutgoing = true)
        h.mesh.claimsArrival("alice")
        h.mesh.claimsArrival("bob")
        return h
    }

    @Test
    fun `every 400 ms the levels of the primary and of each mesh link tell who speaks`() = runTest(UnconfinedTestDispatcher()) {
        val h = callerTrio()
        h.opened.single().level = 0.2
        h.primaryLevel = 0.01
        advanceTimeBy(399)
        assertThat(h.mesh.ui.value.speakingUserIds).isEmpty()
        advanceTimeBy(2)
        assertThat(h.mesh.ui.value.speakingUserIds).containsExactly("bob")
        h.primaryLevel = 0.3
        advanceTimeBy(400)
        assertThat(h.mesh.ui.value.speakingUserIds).containsExactly("alice", "bob")
        h.mesh.teardown()
    }

    @Test
    fun `a speaker who falls silent keeps the ring through the hold, then loses it`() = runTest(UnconfinedTestDispatcher()) {
        val h = callerTrio()
        h.opened.single().level = 0.2
        advanceTimeBy(401)
        h.opened.single().level = 0.0
        advanceTimeBy(800)
        assertThat(h.mesh.ui.value.speakingUserIds).containsExactly("bob")
        advanceTimeBy(400)
        assertThat(h.mesh.ui.value.speakingUserIds).isEmpty()
        h.mesh.teardown()
    }

    @Test
    fun `a departing speaker loses the ring at once and the end of the call stops the readings`() = runTest(UnconfinedTestDispatcher()) {
        val h = callerTrio()
        val bob = h.opened.single()
        bob.level = 0.2
        advanceTimeBy(401)
        h.mesh.onParticipantLeft(CALL, "bob")
        assertThat(h.mesh.ui.value.speakingUserIds).isEmpty()
        h.mesh.teardown()
        val reads = bob.levelReads
        advanceTimeBy(2_000)
        assertThat(bob.levelReads).isEqualTo(reads)
        assertThat(h.mesh.ui.value.speakingUserIds).isEmpty()
    }

    @Test
    fun `a duo never samples anybody`() = runTest(UnconfinedTestDispatcher()) {
        val h = Harness(clock = { testScheduler.currentTime }, samplingMillis = 400)
        h.bind(this, isOutgoing = true)
        h.mesh.claimsArrival("alice")
        h.primaryLevel = 0.5
        advanceTimeBy(2_000)
        assertThat(h.mesh.ui.value.speakingUserIds).isEmpty()
        h.mesh.teardown()
    }
}
