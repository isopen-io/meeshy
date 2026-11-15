package me.meeshy.app.stories

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
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
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.StoryComment
import me.meeshy.sdk.model.StoryCommentPage
import me.meeshy.sdk.model.StoryCommentStatus
import me.meeshy.sdk.model.story.StoryViewerParticipationMark
import me.meeshy.sdk.post.PostModerationRepository
import me.meeshy.sdk.report.ReportRepository
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.SocialSocketManager
import me.meeshy.sdk.story.StoryCommentPublication
import me.meeshy.sdk.story.StoryCommentPublisher
import me.meeshy.sdk.story.StoryCommentsRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class StoryCommentPublishTest {

    @Before fun setUp() { Dispatchers.setMain(UnconfinedTestDispatcher()) }
    @After fun tearDown() { Dispatchers.resetMain() }

    private fun root(id: String) = StoryComment(
        id = id, clientId = null, authorName = "Bob", avatarUrl = null, content = "c$id", isTranslated = false,
        createdAt = null, status = StoryCommentStatus.Sent,
    )

    private class Rig(publication: StoryCommentPublication?) {
        val repository: StoryCommentsRepository = mockk(relaxed = true)
        val session: SessionRepository = mockk(relaxed = true)
        val socket: SocialSocketManager = mockk(relaxed = true)
        val publisher: StoryCommentPublisher = mockk()
        val drafts = StoryCommentDraftStore()
        val participation = StoryViewerParticipationStore()

        init {
            coEvery { repository.cachedRoots(any(), any()) } returns null
            every { session.currentUser } returns MutableStateFlow(MeeshyUser(id = "me", username = "me"))
            every { socket.commentAdded } returns MutableSharedFlow()
            every { socket.commentUpdated } returns MutableSharedFlow()
            every { socket.commentDeleted } returns MutableSharedFlow()
            every { socket.commentReactionAdded } returns MutableSharedFlow()
            every { socket.commentReactionRemoved } returns MutableSharedFlow()
            every { socket.commentTranslationUpdated } returns MutableSharedFlow()
            coEvery { publisher.publish(any(), any(), any(), any()) } coAnswers {
                publication ?: error("la file a levé")
            }
        }

        fun viewModel() = StoryCommentsViewModel(repository, session, socket, mockk(), mockk<ReportRepository>(), publisher, drafts, participation)
            .also { it.begin("s1") }
    }

    @Test
    fun `a comment appears instantly then is marked delivered, the draft goes and the rail notes the comment`() = runTest {
        val rig = Rig(StoryCommentPublication.Delivered)
        rig.drafts.save("s1", "salut")
        val vm = rig.viewModel()

        assertThat(vm.send("  salut ", "fr")).isTrue()

        val row = vm.state.value.comments.roots.single()
        assertThat(row.content).isEqualTo("salut")
        assertThat(row.status).isEqualTo(StoryCommentStatus.Sent)
        assertThat(vm.state.value.comments.count).isEqualTo(1)
        assertThat(rig.drafts.draftOf("s1")).isNull()
        assertThat(rig.participation.marks.value["s1"]).containsExactly(StoryViewerParticipationMark.COMMENTED)
    }

    @Test
    fun `a blank text sends nothing`() = runTest {
        val vm = Rig(StoryCommentPublication.Delivered).viewModel()
        assertThat(vm.send("   ", null)).isFalse()
        assertThat(vm.state.value.comments.roots).isEmpty()
    }

    @Test
    fun `replying to a reply attaches to the root parent and bumps the reply count`() = runTest {
        val rig = Rig(StoryCommentPublication.Delivered)
        coEvery { rig.repository.roots("s1", null, any(), any()) } returns me.meeshy.sdk.net.NetworkResult.Success(
            StoryCommentPage(listOf(root("r1")), null, false),
        )
        val vm = rig.viewModel()
        vm.setReplyTarget(root("r2").copy(parentId = "r1"))

        vm.send("re", "fr")

        assertThat(vm.state.value.comments.roots.single().replyCount).isEqualTo(1)
        assertThat(vm.state.value.comments.repliesOf("r1").single().parentId).isEqualTo("r1")
        assertThat(vm.state.value.replyTarget).isNull()
    }

    @Test
    fun `a failed send keeps the row as failed and a retry sends it again`() = runTest {
        val rig = Rig(StoryCommentPublication.Failed)
        val vm = rig.viewModel()
        vm.send("salut", "fr")
        val tempId = vm.state.value.comments.roots.single().id
        assertThat(vm.state.value.comments.roots.single().status).isEqualTo(StoryCommentStatus.Failed)

        coEvery { rig.publisher.publish(any(), any(), any(), any()) } returns StoryCommentPublication.Delivered
        vm.retrySend(tempId, "fr")

        assertThat(vm.state.value.comments.roots.single().status).isEqualTo(StoryCommentStatus.Sent)
    }

    @Test
    fun `a queue refusal removes the row and returns the text to the composer and to the story draft`() = runTest {
        val rig = Rig(StoryCommentPublication.Refused("salut"))
        val vm = rig.viewModel()
        vm.refused.test {
            vm.send("salut", "fr")
            assertThat(awaitItem()).isEqualTo(StoryCommentsViewModel.RefusedComment("salut", null))
        }
        assertThat(vm.state.value.comments.roots).isEmpty()
        assertThat(vm.state.value.comments.count).isEqualTo(0)
        assertThat(rig.drafts.draftOf("s1")?.text).isEqualTo("salut")
        assertThat(rig.drafts.draftOf("s1")?.refusedAt).isNotNull()
    }

    @Test
    fun `the draft store is emptied with the account`() = runTest {
        val store = StoryCommentDraftStore()
        store.save("s1", "x")
        store.clear()
        assertThat(store.draftOf("s1")).isNull()
    }
}
