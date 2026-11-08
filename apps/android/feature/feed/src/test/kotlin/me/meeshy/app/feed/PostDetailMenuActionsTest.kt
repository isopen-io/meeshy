package me.meeshy.app.feed

import androidx.lifecycle.SavedStateHandle
import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.model.ApiAuthor
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.PrivacyPreferences
import me.meeshy.sdk.model.report.ReportReason
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.post.PostRepository
import me.meeshy.sdk.privacy.InMemoryPrivacyPreferencesStore
import me.meeshy.sdk.report.ReportRepository
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.SocialSocketManager
import org.junit.After
import org.junit.Before
import org.junit.Test

/** Le menu « ... » du detail et les toasts du favori : pin, signalement, suppression, ajoute / retire / erreur. */
@OptIn(ExperimentalCoroutinesApi::class)
class PostDetailMenuActionsTest {

    @Before
    fun setUp() {
        Dispatchers.setMain(UnconfinedTestDispatcher())
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private val repository: PostRepository = mockk(relaxed = true)
    private val reports: ReportRepository = mockk(relaxed = true)
    private val session: SessionRepository = mockk(relaxed = true)
    private val socialSocket: SocialSocketManager = mockk(relaxed = true)
    private val clock = object : CacheClock {
        override fun nowMillis(): Long = 0L
    }
    private val refused = NetworkResult.Failure(ApiError("nope", "SERVER"))

    private fun opened(): PostDetailViewModel {
        coEvery { repository.knownPost(any()) } returns null
        coEvery { repository.getPost("p1") } returns NetworkResult.Success(
            ApiPost(id = "p1", content = "Salut", author = ApiAuthor(id = "me")),
        )
        every { session.currentUser } returns MutableStateFlow<MeeshyUser?>(MeeshyUser(id = "me", username = "me"))
        every { socialSocket.commentAdded } returns MutableSharedFlow()
        every { socialSocket.commentDeleted } returns MutableSharedFlow()
        every { socialSocket.postLiked } returns MutableSharedFlow()
        every { socialSocket.postUnliked } returns MutableSharedFlow()
        return PostDetailViewModel(
            repository, session, socialSocket, MeeshyConfig(), clock,
            InMemoryPrivacyPreferencesStore(PrivacyPreferences()), mockk(relaxed = true),
            SavedStateHandle(mapOf("postId" to "p1")),
            reports = reports,
        )
    }

    @Test
    fun `bookmarking says added, un-bookmarking says removed`() = runTest {
        val vm = opened()

        vm.toggleBookmark()
        assertThat(vm.state.value.notice).isEqualTo(FeedNotice.BOOKMARKED)
        vm.consumeNotice()
        vm.toggleBookmark()
        assertThat(vm.state.value.notice).isEqualTo(FeedNotice.UNBOOKMARKED)
    }

    @Test
    fun `a bookmark that cannot be queued reverts and says so`() = runTest {
        val vm = opened()
        coEvery { repository.setBookmarked("p1", any()) } throws java.io.IOException("disk")

        vm.toggleBookmark()

        assertThat(vm.state.value.post?.isBookmarked).isFalse()
        assertThat(vm.state.value.notice).isEqualTo(FeedNotice.BOOKMARK_FAILED)
    }

    @Test
    fun `pinning confirms, a refusal says it failed`() = runTest {
        val vm = opened()
        coEvery { repository.pinPost("p1") } returns NetworkResult.Success(Unit)
        vm.pin()
        assertThat(vm.state.value.notice).isEqualTo(FeedNotice.PINNED)

        vm.consumeNotice()
        coEvery { repository.pinPost("p1") } returns refused
        vm.pin()
        assertThat(vm.state.value.notice).isEqualTo(FeedNotice.PIN_FAILED)
    }

    @Test
    fun `reporting sends the chosen reason`() = runTest {
        val vm = opened()
        coEvery { reports.reportPost("p1", ReportReason.SPAM, null) } returns NetworkResult.Success(Unit)

        vm.report(ReportReason.SPAM)

        coVerify { reports.reportPost("p1", ReportReason.SPAM, null) }
        assertThat(vm.state.value.notice).isEqualTo(FeedNotice.REPORTED)
    }

    @Test
    fun `deleting closes the screen, a refusal keeps it and says so`() = runTest {
        val vm = opened()
        coEvery { repository.delete("p1") } returns refused
        vm.delete()
        assertThat(vm.state.value.notice).isEqualTo(FeedNotice.DELETE_FAILED)

        coEvery { repository.delete("p1") } returns NetworkResult.Success(Unit)
        vm.effects.test {
            vm.delete()
            assertThat(awaitItem()).isEqualTo(PostDetailEffect.Close)
        }
    }
}
