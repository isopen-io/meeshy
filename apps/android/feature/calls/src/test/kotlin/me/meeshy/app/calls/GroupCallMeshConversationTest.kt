package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.call.group.GroupCallArrival
import me.meeshy.sdk.model.call.group.GroupCallDirectory
import org.junit.Test

/**
 * Le maillage d'un appel qui change de conversation (#19650) : ses noms se relisent dans la conversation où l'appel
 * vit désormais, et un membre découvert par son offre porte SA caméra et SON micro — jamais les miens.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class GroupCallMeshConversationTest {

    private class FakeNames : GroupCallNameSource {
        val reads = mutableListOf<Pair<String, String>>()
        val directories = MutableSharedFlow<GroupCallDirectory>(replay = 0, extraBufferCapacity = 4)
        override fun directoryFor(conversationId: String, callId: String): Flow<GroupCallDirectory> {
            reads += conversationId to callId
            return directories
        }
    }

    private fun Harness.bindSendingVideo(scope: CoroutineScope) = mesh.bind(
        scope, CALL, "m", isOutgoing = false, primaryUserId = "", iceServers = emptyList(),
        sendsAudio = true, sendsVideo = true, conversationId = CONVERSATION,
    )

    @Test
    fun `un membre decouvert par son offre ne recopie pas ma camera`() = runTest(UnconfinedTestDispatcher()) {
        val h = Harness()
        h.bindSendingVideo(this)
        h.signal("offer", from = "alice")
        h.signal("offer", from = "bob", negotiationId = 4)

        assertThat(h.mesh.ui.value.roster.member("bob")!!.isCameraOn).isFalse()
        h.mesh.teardown()
    }

    @Test
    fun `la session servie dit la camera d'un membre decouvert, un evenement plus recent l'emporte`() = runTest(UnconfinedTestDispatcher()) {
        val names = FakeNames()
        val h = Harness(names = names)
        h.bindSendingVideo(this)
        h.signal("offer", from = "alice")
        h.signal("offer", from = "bob", negotiationId = 4)
        h.signal("offer", from = "cleo", negotiationId = 2)
        h.mesh.onMediaToggled(CALL, "cleo", "video", enabled = false)

        names.directories.emit(
            GroupCallDirectory(
                names = mapOf(
                    "bob" to GroupCallArrival("bob", isAudioEnabled = false, isVideoEnabled = true),
                    "cleo" to GroupCallArrival("cleo", isVideoEnabled = true),
                ),
            ),
        )

        val roster = h.mesh.ui.value.roster
        assertThat(roster.member("bob")!!.isCameraOn).isTrue()
        assertThat(roster.member("bob")!!.isMicMuted).isTrue()
        assertThat(roster.member("cleo")!!.isCameraOn).isFalse()

        h.signal("offer", from = "dan", negotiationId = 3)
        assertThat(h.mesh.ui.value.roster.member("dan")!!.isCameraOn).isFalse()
        h.mesh.teardown()
    }

    @Test
    fun `l'appel qui bascule relit ses noms dans la conversation ou il vit desormais`() = runTest(UnconfinedTestDispatcher()) {
        val names = FakeNames()
        val h = Harness(names = names)
        h.bind(this, isOutgoing = false)
        h.signal("offer", from = "alice")
        h.signal("offer", from = "bob", negotiationId = 4)
        assertThat(names.reads).containsExactly(CONVERSATION to CALL)

        h.mesh.moveToConversation("other-call", "group-9")
        h.mesh.moveToConversation(CALL, "group-1")
        h.mesh.moveToConversation(CALL, "group-1")

        assertThat(names.reads).containsExactly(CONVERSATION to CALL, "group-1" to CALL).inOrder()
        h.mesh.teardown()
    }

    @Test
    fun `une bascule avant que le groupe se prouve sert la lecture qui viendra`() = runTest(UnconfinedTestDispatcher()) {
        val names = FakeNames()
        val h = Harness(names = names)
        h.bind(this, isOutgoing = false)
        h.mesh.moveToConversation(CALL, "group-1")
        assertThat(names.reads).isEmpty()

        h.signal("offer", from = "alice")
        h.signal("offer", from = "bob", negotiationId = 4)
        assertThat(names.reads).containsExactly("group-1" to CALL)
        h.mesh.teardown()
    }
}
