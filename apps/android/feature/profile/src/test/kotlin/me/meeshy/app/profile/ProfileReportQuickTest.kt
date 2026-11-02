package me.meeshy.app.profile

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.conversation.DirectConversationOpener
import me.meeshy.sdk.conversation.DirectConversationResolution
import me.meeshy.sdk.conversation.DirectConversationSource
import me.meeshy.sdk.friend.BlockActionCoordinator
import me.meeshy.sdk.friend.BlockCache
import me.meeshy.sdk.friend.BlockFailure
import me.meeshy.sdk.friend.BlockRepository
import me.meeshy.sdk.friend.ConnectionActionController
import me.meeshy.sdk.friend.FriendshipCache
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.friend.ConnectionFeedback
import me.meeshy.sdk.model.report.ReportReason
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.report.ReportRepository
import me.meeshy.sdk.session.SessionRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ProfileReportQuickTest {

    private val dispatcher = UnconfinedTestDispatcher()

    @Before
    fun setUp() = Dispatchers.setMain(dispatcher)

    @After
    fun tearDown() = Dispatchers.resetMain()

    private val reports: ReportRepository = mockk(relaxed = true)

    private fun viewModel() = ProfileActionsViewModel(
        connection = mockk(relaxed = true) { every { feedback } returns MutableSharedFlow<ConnectionFeedback>() },
        friendshipCache = FriendshipCache(),
        blockCache = BlockCache(),
        blockRepository = mockk<BlockRepository>(relaxed = true) {
            coEvery { listBlocked() } returns NetworkResult.Success(emptyList())
        },
        directConversationOpener = DirectConversationOpener(
            object : DirectConversationSource {
                override suspend fun cachedDirectWith(userId: String): ApiConversation? = null
                override suspend fun directConversationWith(userId: String) =
                    DirectConversationResolution.Failed(ApiError("boom"), offline = false)
            },
        ),
        blockActions = mockk<BlockActionCoordinator>(relaxed = true) {
            every { failures } returns MutableSharedFlow<BlockFailure>()
        },
        reportRepository = reports,
        sessionRepository = mockk<SessionRepository>(relaxed = true) { every { currentUserId } returns "me" },
        circles = ProfileCirclesFake(),
    )

    private fun TestScope.events(vm: ProfileActionsViewModel): List<ProfileActionEvent> {
        val seen = mutableListOf<ProfileActionEvent>()
        backgroundScope.launch(dispatcher) { vm.events.collect { seen += it } }
        return seen
    }

    @Test
    fun `the quick report offers the eight iOS reasons in order`() {
        assertThat(ProfileReportQuick.reasons.map { it.wireValue }).containsExactly(
            "spam", "inappropriate", "harassment", "violence",
            "hate_speech", "fake_profile", "impersonation", "other",
        ).inOrder()
    }

    @Test
    fun `the fake profile reason goes out as fake_profile without details`() = runTest {
        coEvery { reports.reportUser("u2", ReportReason.FAKE_PROFILE, null) } returns NetworkResult.Success(Unit)
        val vm = viewModel()
        val seen = events(vm)
        vm.bind("u2", isAnonymous = false)

        vm.report(ReportReason.FAKE_PROFILE)

        coVerify { reports.reportUser("u2", ReportReason.FAKE_PROFILE, null) }
        assertThat(seen).containsExactly(ProfileActionEvent.Toast(ProfileActionFeedback.ReportSent))
    }

    @Test
    fun `a refused report toasts the failure`() = runTest {
        coEvery { reports.reportUser(any(), any(), any()) } returns NetworkResult.Failure(ApiError("no"))
        val vm = viewModel()
        val seen = events(vm)
        vm.bind("u2", isAnonymous = false)

        vm.report(ReportReason.SPAM)

        assertThat(seen).containsExactly(ProfileActionEvent.Toast(ProfileActionFeedback.ReportFailed))
    }

    @Test
    fun `without a session the report is inert and says it failed`() = runTest {
        coEvery { reports.reportUser(any(), any(), any()) } returns null
        val vm = viewModel()
        val seen = events(vm)
        vm.bind("u2", isAnonymous = false)

        vm.report(ReportReason.OTHER)

        assertThat(seen).containsExactly(ProfileActionEvent.Toast(ProfileActionFeedback.ReportFailed))
    }
}
