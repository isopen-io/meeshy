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
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.feedback.HapticKind
import me.meeshy.sdk.lock.InMemoryConversationLockStore
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiParticipant
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
    }

    private class FakeReporter(var result: NetworkResult<Unit>? = NetworkResult.Success(Unit)) : ConversationReporter {
        val sent = mutableListOf<Triple<String, ReportReason, String?>>()
        override suspend fun report(conversationId: String, reason: ReportReason, details: String?): NetworkResult<Unit>? {
            sent += Triple(conversationId, reason, details)
            return result
        }
    }

    private class Harness(
        val controller: ConversationListDialogController,
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
        )
        val lock = ConversationListLockCoordinator(state, lockStore) {}
        val controller = ConversationListDialogController(
            scope = backgroundScope,
            state = state,
            conversationOf = { id -> conversations.firstOrNull { it.id == id } },
            actions = actions,
            repository = repo,
            deps = ConversationListDialogDeps(blocker, reporter),
            lock = lock,
            lockStore = lockStore,
        )
        val effects = mutableListOf<ConversationListDialogEffect>()
        backgroundScope.launch { controller.effects.collect { effects += it } }
        return Harness(controller, repo, blocker, reporter, effects)
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
        coVerify { h.repo.deleteForMe("g1") }
    }

    @Test
    fun `an anonymous guest is offered no removal`() = runTest(StandardTestDispatcher()) {
        val h = harness(group(), user = me.copy(isAnonymous = true))

        h.controller.requestRemoval("g1")

        assertThat(h.controller.dialog.value).isNull()
    }

    // ── Quitter, renommer ──

    @Test
    fun `a failed leave says so with a toast`() = runTest(StandardTestDispatcher()) {
        val h = harness(group())
        coEvery { h.repo.leave("g1") } returns NetworkResult.Failure(ApiError("boom"))

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
}
