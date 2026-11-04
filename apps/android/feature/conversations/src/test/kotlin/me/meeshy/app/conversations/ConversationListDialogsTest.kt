package me.meeshy.app.conversations

import androidx.work.WorkManager
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import me.meeshy.feature.conversations.R
import me.meeshy.sdk.category.CategoryRepository
import me.meeshy.sdk.chat.InMemoryConversationDraftStore
import me.meeshy.sdk.conversation.ConversationObsoleting
import me.meeshy.sdk.conversation.ConversationRemoval
import me.meeshy.sdk.conversation.ConversationRemovalWrite
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.feedback.HapticKind
import me.meeshy.sdk.lock.InMemoryConversationLockStore
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiParticipant
import me.meeshy.sdk.model.ConversationObsoleted
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.conversationlist.ConversationRowMenuCapabilities.Removal
import me.meeshy.sdk.model.report.ReportReason
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.ui.component.FeedbackKind
import me.meeshy.ui.component.FeedbackToastRequest
import org.junit.Test

/**
 * L'état scellé des dialogues de la liste : un seul à la fois, gardé par les capacités de la
 * rangée, retrouvé après rotation, et chaque confirmation qui agit (blocage + archivage,
 * suppression / masquage, départ, renommage rogné, signalement).
 */
@OptIn(ExperimentalCoroutinesApi::class)
class ConversationListDialogsTest {

    private class FakeBlocker(var accepts: Boolean = true) : ConversationPeerBlocker {
        val blocked = mutableListOf<String>()
        val unblocked = mutableListOf<String>()
        override suspend fun block(userId: String): Boolean = accepts.also { blocked += userId }
        override suspend fun unblock(userId: String): Boolean = accepts.also { unblocked += userId }
        val alreadyBlocked = mutableSetOf<String>()
        override fun isBlocked(userId: String): Boolean = userId in alreadyBlocked
    }

    private class FakeReporter(var result: NetworkResult<Unit>? = NetworkResult.Success(Unit)) : ConversationReporter {
        val sent = mutableListOf<Triple<String, ReportReason, String?>>()
        override suspend fun report(conversationId: String, reason: ReportReason, details: String?): NetworkResult<Unit>? {
            sent += Triple(conversationId, reason, details)
            return result
        }
    }

    private class FakeObsoleter(
        var result: NetworkResult<ConversationObsoleted> = NetworkResult.Success(ConversationObsoleted(conversationId = "any")),
    ) : ConversationObsoleting {
        val asked = mutableListOf<String>()
        override suspend fun makeObsolete(conversationId: String): NetworkResult<ConversationObsoleted> {
            asked += conversationId
            return result
        }
    }

    private class Harness(
        val controller: ConversationListDialogController,
        val state: MutableStateFlow<ConversationListUiState>,
        val obsoleter: FakeObsoleter,
        val remover: FakeConversationRemover,
        val repo: ConversationRepository,
        val blocker: FakeBlocker,
        val reporter: FakeReporter,
        val effects: MutableList<ConversationListDialogEffect>,
    )

    private val me = MeeshyUser(id = "me", username = "me", displayName = "Me", role = "USER", isAnonymous = false)

    private fun direct(id: String = "d1", peer: String = "peer") = ApiConversation(
        id = id,
        type = "direct",
        currentUserRole = "member",
        participants = listOf(ApiParticipant(id = "p-me", userId = "me"), ApiParticipant(id = "p-peer", userId = peer)),
    )

    private fun group(id: String = "g1", role: String = "member") =
        ApiConversation(id = id, type = "group", title = "Équipe", currentUserRole = role)

    private fun TestScope.harness(
        vararg conversations: ApiConversation,
        user: MeeshyUser? = me,
        blocker: FakeBlocker = FakeBlocker(),
        reporter: FakeReporter = FakeReporter(),
        webOrigin: String = "",
        obsoleter: FakeObsoleter = FakeObsoleter(),
        remover: FakeConversationRemover = FakeConversationRemover(),
    ): Harness {
        val repo = mockk<ConversationRepository>(relaxed = true)
        val state = MutableStateFlow(ConversationListUiState(currentUserId = user?.id, currentUser = user))
        val lockStore = InMemoryConversationLockStore()
        val actions = ConversationListRowActions(
            scope = backgroundScope,
            state = state,
            rawConversations = { conversations.toList() },
            repository = repo,
            messageRepository = mockk<MessageRepository>(relaxed = true),
            categoryRepository = mockk<CategoryRepository>(relaxed = true),
            draftStore = InMemoryConversationDraftStore(),
            workManager = mockk<WorkManager>(relaxed = true),
            obsoleter = obsoleter,
            remover = remover,
        )
        val lock = ConversationListLockCoordinator(state, lockStore) {}
        val controller = ConversationListDialogController(
            scope = backgroundScope,
            state = state,
            conversationOf = { id -> conversations.firstOrNull { it.id == id } },
            actions = actions,
            repository = repo,
            deps = ConversationListDialogDeps(blocker, reporter, obsoleter = obsoleter, webOrigin = webOrigin, remover = remover),
            lock = lock,
            lockStore = lockStore,
        )
        val effects = mutableListOf<ConversationListDialogEffect>()
        backgroundScope.launch { controller.effects.collect { effects += it } }
        return Harness(controller, state, obsoleter, remover, repo, blocker, reporter, effects)
    }

    // ── État scellé ──

    @Test
    fun `a new dialog replaces the armed one, never two at once`() = runTest(StandardTestDispatcher()) {
        val h = harness(group(role = "moderator"))

        h.controller.requestLeave("g1")
        h.controller.requestRename("g1")

        assertThat(h.controller.dialog.value).isEqualTo(ConversationListDialog.Rename("g1", "Équipe"))
    }

    @Test
    fun `a rotation finds the armed dialog again`() = runTest(StandardTestDispatcher()) {
        val h = harness(group())
        h.controller.requestLeave("g1")

        val afterRecreation = h.controller.dialog.first()

        assertThat(afterRecreation).isEqualTo(ConversationListDialog.Leave("g1"))
    }

    @Test
    fun `an unknown conversation arms nothing`() = runTest(StandardTestDispatcher()) {
        val h = harness(group())

        h.controller.requestRemoval("ghost")
        h.controller.requestBlock("ghost")

        assertThat(h.controller.dialog.value).isNull()
    }

    // ── Bloquer ──

    @Test
    fun `blocking confirms, then blocks, archives and plays the success haptic`() = runTest(StandardTestDispatcher()) {
        val h = harness(direct())

        h.controller.requestBlock("d1")
        assertThat(h.controller.dialog.value).isEqualTo(ConversationListDialog.Block("d1", "peer"))
        h.controller.confirmBlock()
        runCurrent()

        assertThat(h.controller.dialog.value).isNull()
        assertThat(h.blocker.blocked).containsExactly("peer")
        coVerify { h.repo.setArchivedOptimistic("d1", true) }
        assertThat(h.effects).containsExactly(ConversationListDialogEffect.Haptic(HapticKind.SUCCESS))
    }

    @Test
    fun `a refused block archives nothing and says so`() = runTest(StandardTestDispatcher()) {
        val h = harness(direct(), blocker = FakeBlocker(accepts = false))

        h.controller.requestBlock("d1")
        h.controller.confirmBlock()
        runCurrent()

        coVerify(exactly = 0) { h.repo.setArchivedOptimistic(any(), any()) }
        assertThat(h.effects).containsExactly(
            ConversationListDialogEffect.Toast(FeedbackToastRequest(R.string.dialogs_block_error, FeedbackKind.Error)),
        )
    }

    @Test
    fun `a group has no peer to block`() = runTest(StandardTestDispatcher()) {
        val h = harness(group())

        h.controller.requestBlock("g1")

        assertThat(h.controller.dialog.value).isNull()
    }

    @Test
    fun `unblocking needs no confirmation and plays the success haptic`() = runTest(StandardTestDispatcher()) {
        val h = harness(direct())

        h.controller.unblock("d1")
        runCurrent()

        assertThat(h.controller.dialog.value).isNull()
        assertThat(h.blocker.unblocked).containsExactly("peer")
        assertThat(h.effects).containsExactly(ConversationListDialogEffect.Haptic(HapticKind.SUCCESS))
    }

    // ── Supprimer / masquer ──

    @Test
    fun `a direct reads delete and a group reads hide`() = runTest(StandardTestDispatcher()) {
        val h = harness(direct(), group())

        h.controller.requestRemoval("d1")
        val directDialog = h.controller.dialog.value as ConversationListDialog.Removal
        h.controller.requestRemoval("g1")
        val groupDialog = h.controller.dialog.value as ConversationListDialog.Removal

        assertThat(directDialog.removal).isEqualTo(Removal.DELETE)
        assertThat(groupDialog.removal).isEqualTo(Removal.HIDE)
        assertThat(groupDialog.conversationName).isEqualTo("Équipe")
    }

    @Test
    fun `confirming a removal plays the heavy haptic and hides for me`() = runTest(StandardTestDispatcher()) {
        val h = harness(group())

        h.controller.requestRemoval("g1")
        h.controller.confirmRemoval()
        runCurrent()

        assertThat(h.controller.dialog.value).isNull()
        assertThat(h.effects).containsExactly(ConversationListDialogEffect.Haptic(HapticKind.HEAVY))
        assertThat(h.remover.calls).containsExactly("g1" to ConversationRemoval.DELETE_FOR_ME)
    }

    @Test
    fun `an anonymous guest is offered no removal`() = runTest(StandardTestDispatcher()) {
        val h = harness(group(), user = me.copy(isAnonymous = true))

        h.controller.requestRemoval("g1")

        assertThat(h.controller.dialog.value).isNull()
    }

    // ── Rendre obsolète (#14645) ──

    @Test
    fun `the obsolete swipe of a group admin asks to confirm, naming the conversation`() = runTest(StandardTestDispatcher()) {
        val h = harness(group(role = "admin"))

        h.controller.requestObsolete("g1")

        assertThat(h.controller.dialog.value).isEqualTo(ConversationListDialog.Obsolete("g1", "Équipe"))
    }

    @Test
    fun `either member of an open direct is asked to confirm`() = runTest(StandardTestDispatcher()) {
        val h = harness(direct())

        h.controller.requestObsolete("d1")

        assertThat(h.controller.dialog.value).isInstanceOf(ConversationListDialog.Obsolete::class.java)
    }

    @Test
    fun `a viewer the gateway would refuse is never asked to make it obsolete`() = runTest(StandardTestDispatcher()) {
        val h = harness(group(role = "moderator"), ApiConversation(id = "meeshy", type = "global", currentUserRole = "creator"))

        h.controller.requestObsolete("g1")
        val moderator = h.controller.dialog.value
        h.controller.requestObsolete("meeshy")

        assertThat(moderator).isNull()
        assertThat(h.controller.dialog.value).isNull()
    }

    @Test
    fun `confirming obsolete plays the heavy haptic, drops the row at once and asks the gateway`() = runTest(StandardTestDispatcher()) {
        val h = harness(group(role = "admin"))

        h.controller.requestObsolete("g1")
        h.controller.confirmObsolete()
        val pendingBeforeAnswer = h.state.value.pendingRemovals
        runCurrent()

        assertThat(h.controller.dialog.value).isNull()
        assertThat(pendingBeforeAnswer).contains("g1")
        assertThat(h.obsoleter.asked).containsExactly("g1")
        assertThat(h.effects).containsExactly(ConversationListDialogEffect.Haptic(HapticKind.HEAVY))
    }

    @Test
    fun `dismissing the obsolete confirmation asks nothing`() = runTest(StandardTestDispatcher()) {
        val h = harness(group(role = "admin"))

        h.controller.requestObsolete("g1")
        h.controller.dismiss()
        h.controller.confirmObsolete()
        runCurrent()

        assertThat(h.obsoleter.asked).isEmpty()
    }

    @Test
    fun `the sender of a request not yet accepted reads why the gateway refused, and the row comes back`() = runTest(StandardTestDispatcher()) {
        val refused = FakeObsoleter(NetworkResult.Failure(ApiError(message = "Seul le destinataire", httpStatus = 403)))
        val h = harness(direct(), obsoleter = refused)

        h.controller.requestObsolete("d1")
        h.controller.confirmObsolete()
        runCurrent()

        assertThat(h.state.value.pendingRemovals).doesNotContain("d1")
        assertThat(h.effects).containsAtLeast(
            ConversationListDialogEffect.Haptic(HapticKind.ERROR),
            ConversationListDialogEffect.Toast(
                FeedbackToastRequest(R.string.conversations_obsolete_refused_pending_request, FeedbackKind.Error),
            ),
        ).inOrder()
    }

    @Test
    fun `any other refusal says the generic failure`() = runTest(StandardTestDispatcher()) {
        val refused = FakeObsoleter(NetworkResult.Failure(ApiError(message = "down", httpStatus = 403)))
        val h = harness(group(role = "admin"), obsoleter = refused)

        h.controller.requestObsolete("g1")
        h.controller.confirmObsolete()
        runCurrent()

        assertThat(h.effects).contains(
            ConversationListDialogEffect.Toast(FeedbackToastRequest(R.string.conversations_obsolete_error, FeedbackKind.Error)),
        )
    }

    @Test
    fun `the menu, which confirmed on its own, reads the same refusal`() = runTest(StandardTestDispatcher()) {
        val refused = FakeObsoleter(NetworkResult.Failure(ApiError(message = "", httpStatus = 403)))
        val h = harness(direct(), obsoleter = refused)

        h.controller.makeObsolete("d1")
        runCurrent()

        assertThat(refused.asked).containsExactly("d1")
        assertThat(h.state.value.pendingRemovals).doesNotContain("d1")
        assertThat(h.effects).contains(
            ConversationListDialogEffect.Toast(
                FeedbackToastRequest(R.string.conversations_obsolete_refused_pending_request, FeedbackKind.Error),
            ),
        )
    }

    @Test
    fun `an accepted obsolete says nothing more`() = runTest(StandardTestDispatcher()) {
        val h = harness(direct())

        h.controller.makeObsolete("d1")
        runCurrent()

        assertThat(h.effects.filterIsInstance<ConversationListDialogEffect.Toast>()).isEmpty()
    }

    // ── Quitter, renommer ──

    @Test
    fun `a failed leave says so with a toast`() = runTest(StandardTestDispatcher()) {
        val h = harness(group())
        h.remover.write = ConversationRemovalWrite.Failed("boom")

        h.controller.requestLeave("g1")
        h.controller.confirmLeave()
        runCurrent()

        assertThat(h.effects).containsExactly(
            ConversationListDialogEffect.Haptic(HapticKind.HEAVY),
            ConversationListDialogEffect.Toast(FeedbackToastRequest(R.string.dialogs_leave_error, FeedbackKind.Error)),
        ).inOrder()
    }

    @Test
    fun `a direct cannot be left`() = runTest(StandardTestDispatcher()) {
        val h = harness(direct())

        h.controller.requestLeave("d1")

        assertThat(h.controller.dialog.value).isNull()
    }

    @Test
    fun `renaming trims the name and a blank name writes nothing`() = runTest(StandardTestDispatcher()) {
        val h = harness(group(role = "moderator"))
        coEvery { h.repo.setCustomNameOptimistic(any(), any()) } returns false

        h.controller.requestRename("g1")
        h.controller.confirmRename("   ")
        runCurrent()
        coVerify(exactly = 0) { h.repo.setCustomNameOptimistic(any(), any()) }

        h.controller.requestRename("g1")
        h.controller.confirmRename("  Nouvelle équipe  ")
        runCurrent()

        assertThat(h.controller.dialog.value).isNull()
        coVerify { h.repo.setCustomNameOptimistic("g1", "Nouvelle équipe") }
    }

    @Test
    fun `a plain member is offered no rename`() = runTest(StandardTestDispatcher()) {
        val h = harness(group(role = "member"))

        h.controller.requestRename("g1")

        assertThat(h.controller.dialog.value).isNull()
    }

    // ── Signaler ──

    @Test
    fun `a conversation with oneself is never offered a report`() = runTest(StandardTestDispatcher()) {
        val h = harness(direct(peer = "me"))

        h.controller.requestReport("d1")

        assertThat(h.controller.dialog.value).isNull()
    }

    @Test
    fun `a successful report closes the sheet with the success haptic and toast`() = runTest(StandardTestDispatcher()) {
        val h = harness(group())

        h.controller.requestReport("g1")
        h.controller.submitReport(ReportReason.SPAM, "pub")
        runCurrent()

        assertThat(h.controller.dialog.value).isNull()
        assertThat(h.reporter.sent).containsExactly(Triple("g1", ReportReason.SPAM, "pub"))
        assertThat(h.effects).containsExactly(
            ConversationListDialogEffect.Haptic(HapticKind.SUCCESS),
            ConversationListDialogEffect.Toast(FeedbackToastRequest(R.string.dialogs_report_success, FeedbackKind.Success)),
        ).inOrder()
    }

    @Test
    fun `a failed report says so and an inert report says nothing`() = runTest(StandardTestDispatcher()) {
        val reporter = FakeReporter(result = NetworkResult.Failure(ApiError("down")))
        val h = harness(group(), reporter = reporter)

        h.controller.requestReport("g1")
        h.controller.submitReport(ReportReason.OTHER, null)
        runCurrent()
        reporter.result = null
        h.controller.requestReport("g1")
        h.controller.submitReport(ReportReason.OTHER, null)
        runCurrent()

        assertThat(h.effects).containsExactly(
            ConversationListDialogEffect.Haptic(HapticKind.ERROR),
            ConversationListDialogEffect.Toast(FeedbackToastRequest(R.string.dialogs_report_error, FeedbackKind.Error)),
        ).inOrder()
    }

    // ── Infos, inviter ──

    @Test
    fun `info is taken for navigation exactly once`() = runTest(StandardTestDispatcher()) {
        val h = harness(group())

        h.controller.requestInfo("g1")
        val armed = h.controller.dialog.value!!

        assertThat(h.controller.takeNavigation(armed)).isTrue()
        assertThat(h.controller.takeNavigation(armed)).isFalse()
        assertThat(h.controller.dialog.value).isNull()
    }

    @Test
    fun `invite needs the invite capability`() = runTest(StandardTestDispatcher()) {
        val h = harness(group(id = "g1", role = "member"), group(id = "g2", role = "creator"))

        h.controller.requestInvite("g1")
        assertThat(h.controller.dialog.value).isNull()
        h.controller.requestInvite("g2")

        assertThat(h.controller.dialog.value).isEqualTo(ConversationListDialog.Invite("g2"))
    }

    // ── Ce que le menu lit : blocage du pair, administration ──

    @Test
    fun `the menu reads the block state of a direct peer, and nothing for a group`() = runTest(StandardTestDispatcher()) {
        val blocker = FakeBlocker().apply { alreadyBlocked += "peer" }
        val h = harness(direct(), group(), blocker = blocker)

        assertThat(h.controller.isPeerBlocked("d1")).isTrue()
        assertThat(h.controller.isPeerBlocked("g1")).isNull()
    }

    @Test
    fun `a platform admin opens the admin console of the conversation in the browser`() = runTest(StandardTestDispatcher()) {
        val admin = me.copy(role = "ADMIN")
        val h = harness(group(), user = admin, webOrigin = "https://meeshy.me/")

        h.controller.openAdminConsole("g1")
        runCurrent()

        assertThat(h.effects).containsExactly(
            ConversationListDialogEffect.OpenUrl("https://meeshy.me/admin/conversations/g1"),
        )
    }

    @Test
    fun `an ordinary member never reaches the admin console, nor an unknown web origin`() = runTest(StandardTestDispatcher()) {
        val member = harness(group(), webOrigin = "https://meeshy.me")
        val noOrigin = harness(group(), user = me.copy(role = "ADMIN"), webOrigin = "")

        member.controller.openAdminConsole("g1")
        noOrigin.controller.openAdminConsole("g1")
        runCurrent()

        assertThat(member.effects).isEmpty()
        assertThat(noOrigin.effects).isEmpty()
        assertThat(noOrigin.controller.canOpenAdminConsole).isFalse()
    }

    // ── Retraits hors ligne ──

    @Test
    fun `a leave goes through the offline queue and says nothing while it holds`() = runTest(StandardTestDispatcher()) {
        val h = harness(group())

        h.controller.requestLeave("g1")
        h.controller.confirmLeave()
        runCurrent()

        assertThat(h.remover.calls).containsExactly("g1" to ConversationRemoval.LEAVE)
        assertThat(h.effects.filterIsInstance<ConversationListDialogEffect.Toast>()).isEmpty()
    }

    @Test
    fun `a removal the gateway refuses for good warns with an error toast`() = runTest(StandardTestDispatcher()) {
        val h = harness(group())
        runCurrent()

        h.remover.refuse("g1", ConversationRemoval.DELETE_FOR_ME)
        runCurrent()

        assertThat(h.effects).containsExactly(
            ConversationListDialogEffect.Haptic(HapticKind.ERROR),
            ConversationListDialogEffect.Toast(FeedbackToastRequest(R.string.conversation_removal_refused_delete, FeedbackKind.Error)),
        ).inOrder()
    }

    @Test
    fun `a refused leave brings back the leave error text`() = runTest(StandardTestDispatcher()) {
        val h = harness(group())
        runCurrent()

        h.remover.refuse("g1", ConversationRemoval.LEAVE)
        runCurrent()

        assertThat(h.effects.last()).isEqualTo(
            ConversationListDialogEffect.Toast(FeedbackToastRequest(R.string.dialogs_leave_error, FeedbackKind.Error)),
        )
    }
}
