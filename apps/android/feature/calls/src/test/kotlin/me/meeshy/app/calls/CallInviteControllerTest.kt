package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.FriendRequestUser
import me.meeshy.sdk.model.call.CallControlRefusal
import me.meeshy.sdk.model.call.CallInviteOutcome
import me.meeshy.sdk.model.call.CallInviteSettled
import me.meeshy.sdk.model.call.CallInvitedUser
import me.meeshy.sdk.model.call.CallParticipantArrival
import me.meeshy.sdk.model.call.CallParticipantInvited
import me.meeshy.sdk.model.call.CallState
import me.meeshy.sdk.model.call.group.CallInviteNotice
import me.meeshy.sdk.model.call.group.GroupCallArrival
import me.meeshy.sdk.socket.CallSignalManager
import me.meeshy.sdk.socket.CallSocialSignalManager
import org.junit.Test

/**
 * « Ajouter des personnes » (#13740, #13753), comme iOS `CallControlsController` : l'ami sonne aussitôt
 * (optimiste), un refus de la passerelle le retire et se dit, une invitation qui se solde dit « X a refusé » ou
 * « X n'a pas répondu », et un invité qui rejoint quitte la bande sans mot.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class CallInviteControllerTest {

    private val invited = MutableSharedFlow<CallParticipantInvited>(extraBufferCapacity = 8)
    private val settled = MutableSharedFlow<CallInviteSettled>(extraBufferCapacity = 8)
    private val arrivals = MutableSharedFlow<CallParticipantArrival>(extraBufferCapacity = 8)
    private val social: CallSocialSignalManager = mockk(relaxed = true) {
        every { participantInvited } returns invited
        every { inviteSettled } returns settled
    }
    private val signals: CallSignalManager = mockk(relaxed = true) {
        every { participantArrivals } returns arrivals
    }
    private fun kotlinx.coroutines.CoroutineScope.controller() = CallInviteController(
        social = social,
        signals = signals,
        loadFriends = { listOf(FriendRequestUser(id = "bob", username = "bob")) },
        scope = this,
    ).also { it.onTransition(CallState.Idle, CallState.Connected, CallSessionInfo("call-1", CallConfig.EMPTY)) }

    @Test
    fun `an invited friend rings at once and the gateway is asked`() = runTest(UnconfinedTestDispatcher()) {
        coEvery { social.inviteCallParticipant("call-1", "bob") } returns Result.success(Unit)
        val controller = controller()

        assertThat(controller.invite(BOB)).isTrue()
        assertThat(controller.invite(BOB)).isFalse()

        assertThat(controller.state.value.board.invites.single().displayName).isEqualTo("Bob")
        coVerify(exactly = 1) { social.inviteCallParticipant("call-1", "bob") }
        assertThat(controller.state.value.board.notice).isNull()
        controller.onCleared()
    }

    @Test
    fun `a refused invitation stops ringing and says so`() = runTest(UnconfinedTestDispatcher()) {
        coEvery { social.inviteCallParticipant(any(), any()) } returns Result.failure(CallControlRefusal(CallControlRefusal.TIMEOUT))
        val controller = controller()

        controller.invite(BOB)

        assertThat(controller.state.value.ringing).isEmpty()
        assertThat(controller.state.value.board.notice).isEqualTo(CallInviteNotice.Failed)
        controller.onCleared()
    }

    @Test
    fun `a settled invitation or an arrival leaves the ringing list, another call's never does`() = runTest(UnconfinedTestDispatcher()) {
        val controller = controller()
        invited.emit(CallParticipantInvited("call-1", "a", CallInvitedUser("bob", "bob"), 3))
        invited.emit(CallParticipantInvited("call-1", "a", CallInvitedUser("carol", "carol"), 4))
        invited.emit(CallParticipantInvited("call-2", "a", CallInvitedUser("dan", "dan"), 2))
        assertThat(controller.state.value.ringing).containsExactly("bob", "carol")

        settled.emit(CallInviteSettled("call-1", "bob", CallInviteOutcome.DECLINED))
        arrivals.emit(CallParticipantArrival("call-1", GroupCallArrival("carol")))
        assertThat(controller.state.value.ringing).isEmpty()
        assertThat(controller.state.value.board.notice).isEqualTo(CallInviteNotice.Declined("bob"))
        controller.onCleared()
    }

    @Test
    fun `a decline and a missing answer say who, the word goes away, and the end of the call forgets everything`() = runTest(UnconfinedTestDispatcher()) {
        val controller = controller()
        invited.emit(CallParticipantInvited("call-1", "a", CallInvitedUser("bob", "bob", displayName = "Bob"), 3))
        invited.emit(CallParticipantInvited("call-1", "a", CallInvitedUser("carol", "carol", displayName = "Carol"), 4))

        settled.emit(CallInviteSettled("call-2", "bob", CallInviteOutcome.DECLINED))
        assertThat(controller.state.value.board.notice).isNull()

        settled.emit(CallInviteSettled("call-1", "bob", CallInviteOutcome.EXPIRED))
        assertThat(controller.state.value.board.notice).isEqualTo(CallInviteNotice.Unanswered("Bob"))
        controller.dismissNotice()
        assertThat(controller.state.value.board.notice).isNull()

        controller.onTransition(CallState.Connected, CallState.Idle, CallSessionInfo("", CallConfig.EMPTY))
        assertThat(controller.state.value.board.invites).isEmpty()
        controller.onCleared()
    }

    @Test
    fun `friends are read on demand, and nothing rings without a call`() = runTest(UnconfinedTestDispatcher()) {
        val controller = controller()
        controller.load()
        assertThat(controller.state.value.isLoaded).isTrue()
        assertThat(controller.state.value.friends.map { it.id }).containsExactly("bob")

        controller.onTransition(CallState.Connected, CallState.Idle, CallSessionInfo("", CallConfig.EMPTY))
        assertThat(controller.invite(BOB)).isFalse()
    }

    private companion object {
        val BOB = CallInvitedUser("bob", "bob", displayName = "Bob")
    }
}
