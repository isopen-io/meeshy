package me.meeshy.app.feed

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.model.PostComposerDraftSnapshot
import me.meeshy.sdk.model.StoryComposerDraftSnapshot
import me.meeshy.sdk.model.StoryDraftSlideSnapshot
import me.meeshy.sdk.post.InMemoryPostComposerDraftStore
import me.meeshy.sdk.story.InMemoryStoryComposerDraftStore
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class DraftResumeViewModelTest {

    @Before
    fun setUp() = Dispatchers.setMain(UnconfinedTestDispatcher())

    @After
    fun tearDown() = Dispatchers.resetMain()

    private val post = PostComposerDraftSnapshot(text = "salut", updatedAtMillis = 10L)
    private fun story(awaiting: List<String> = emptyList()) = StoryComposerDraftSnapshot(
        slides = listOf(StoryDraftSlideSnapshot(id = "s1", text = "yo")),
        selectedId = "s1",
        awaitingPublication = awaiting,
    )

    @Test
    fun `the drafts the device holds appear, and follow the stores as they change`() = runTest {
        val posts = InMemoryPostComposerDraftStore()
        val vm = DraftResumeViewModel(posts, InMemoryStoryComposerDraftStore(story()))

        vm.entries.test {
            assertThat(awaitItem().map { it.kind }).containsExactly(DraftResumeKind.STORY)
            posts.saveEditing(post)
            assertThat(awaitItem().map { it.kind }).containsExactly(DraftResumeKind.POST, DraftResumeKind.STORY).inOrder()
            posts.clearEditing()
            assertThat(awaitItem().map { it.kind }).containsExactly(DraftResumeKind.STORY)
        }
    }

    @Test
    fun `discarding a post draft erases it and leaves the story draft`() = runTest {
        val posts = InMemoryPostComposerDraftStore(editing = post)
        val stories = InMemoryStoryComposerDraftStore(story())
        val vm = DraftResumeViewModel(posts, stories)

        vm.discard(DraftResumeKind.POST)

        assertThat(posts.loadEditing()).isNull()
        assertThat(stories.load()).isNotNull()
    }

    @Test
    fun `discarding a story draft erases it`() = runTest {
        val stories = InMemoryStoryComposerDraftStore(story())
        val vm = DraftResumeViewModel(InMemoryPostComposerDraftStore(), stories)

        vm.discard(DraftResumeKind.STORY)

        assertThat(stories.load()).isNull()
    }

    @Test
    fun `a story draft on its way is never erased by a discard`() = runTest {
        val stories = InMemoryStoryComposerDraftStore(story(awaiting = listOf("cmid_1")))
        val vm = DraftResumeViewModel(InMemoryPostComposerDraftStore(), stories)

        vm.discard(DraftResumeKind.STORY)

        assertThat(stories.load()?.isAwaitingPublication).isTrue()
    }

    @Test
    fun `discarding a reel draft erases the composer slot it lives in`() = runTest {
        val reel = PostComposerDraftSnapshot(
            media = listOf(me.meeshy.sdk.model.UploadedMedia("v1", "", "video/mp4", 0L, null, null, 9_000L, null)),
            updatedAtMillis = 10L,
        )
        val posts = InMemoryPostComposerDraftStore(editing = reel)
        val vm = DraftResumeViewModel(posts, InMemoryStoryComposerDraftStore())

        vm.entries.test {
            assertThat(awaitItem().single().kind).isEqualTo(DraftResumeKind.REEL)
            vm.discard(DraftResumeKind.REEL)
            assertThat(awaitItem()).isEmpty()
        }
        assertThat(posts.loadEditing()).isNull()
    }
}
