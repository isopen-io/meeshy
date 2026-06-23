package me.meeshy.app.stories

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
import me.meeshy.sdk.model.ApiAuthor
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ApiPostMedia
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.SocketStoryReactedData
import me.meeshy.sdk.model.SocketStoryUnreactedData
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.SocialSocketManager
import me.meeshy.sdk.story.StoryRepository
import org.junit.After
import org.junit.Before
import org.junit.Test
import java.time.Instant

@OptIn(ExperimentalCoroutinesApi::class)
class StoryViewerViewModelTest {

    private val dispatcher = UnconfinedTestDispatcher()

    @Before
    fun setUp() = Dispatchers.setMain(dispatcher)

    @After
    fun tearDown() = Dispatchers.resetMain()

    private val storyRepository: StoryRepository = mockk(relaxed = true)
    private val session: SessionRepository = mockk(relaxed = true)
    private val reactedFlow = MutableSharedFlow<SocketStoryReactedData>(extraBufferCapacity = 8)
    private val unreactedFlow = MutableSharedFlow<SocketStoryUnreactedData>(extraBufferCapacity = 8)
    private val socialSocket: SocialSocketManager = mockk(relaxed = true) {
        every { storyReacted } returns reactedFlow
        every { storyUnreacted } returns unreactedFlow
    }
    private val config = MeeshyConfig()

    private val now = Instant.parse("2026-06-17T12:00:00Z").toEpochMilli()
    private fun isoAgo(hours: Long) = Instant.ofEpochMilli(now - hours * 3_600_000).toString()

    private fun storyPost(
        id: String,
        authorId: String,
        hoursAgo: Long,
        reactionSummary: Map<String, Int>? = null,
    ) = ApiPost(
        id = id,
        type = "STORY",
        content = "text-$id",
        createdAt = isoAgo(hoursAgo),
        author = ApiAuthor(id = authorId, username = "name-$authorId"),
        isViewedByMe = false,
        reactionSummary = reactionSummary,
    )

    private fun viewModel(
        startUserId: String,
        posts: List<ApiPost>,
    ): StoryViewerViewModel {
        every { session.currentUser } returns MutableStateFlow<MeeshyUser?>(null)
        every { session.currentUserId } returns null
        coEvery { storyRepository.list(any(), any()) } returns NetworkResult.Success(posts)
        coEvery { storyRepository.markViewed(any()) } returns NetworkResult.Success(Unit)
        coEvery { storyRepository.react(any(), any()) } returns NetworkResult.Success(Unit)
        val handle = SavedStateHandle(mapOf(StoryViewerViewModel.USER_ID_ARG to startUserId))
        return StoryViewerViewModel(storyRepository, session, socialSocket, config, handle)
    }

    // Group "a"'s latest story is the newest overall so it sorts first; "b" follows.
    // Each group's slides are ordered oldest-first, so b1 must predate b2.
    private fun twoAuthors() = listOf(
        storyPost("a1", "a", hoursAgo = 1),
        storyPost("b1", "b", hoursAgo = 3),
        storyPost("b2", "b", hoursAgo = 2),
    )

    @Test
    fun `load positions on the requested user's group and exposes its slides`() = runTest {
        val vm = viewModel(startUserId = "b", posts = twoAuthors())
        vm.state.test {
            val s = awaitItem()
            assertThat(s.isLoading).isFalse()
            assertThat(s.authorName).isEqualTo("name-b")
            assertThat(s.slides.map { it.id }).containsExactly("b1", "b2").inOrder()
            assertThat(s.index).isEqualTo(0)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `advance walks within a group then rolls into the next group`() = runTest {
        val vm = viewModel(startUserId = "a", posts = twoAuthors())
        assertThat(vm.state.value.authorName).isEqualTo("name-a")

        vm.advance() // past a's only slide → group b
        assertThat(vm.state.value.authorName).isEqualTo("name-b")
        assertThat(vm.state.value.current?.id).isEqualTo("b1")

        vm.advance() // b1 → b2
        assertThat(vm.state.value.current?.id).isEqualTo("b2")
        assertThat(vm.state.value.isDismissed).isFalse()
    }

    @Test
    fun `advancing past the final slide dismisses the viewer`() = runTest {
        val vm = viewModel(startUserId = "a", posts = twoAuthors())
        vm.advance() // → b1
        vm.advance() // → b2
        vm.advance() // past last → dismissed
        assertThat(vm.state.value.isDismissed).isTrue()
    }

    @Test
    fun `back from a group's first slide rolls to the previous group`() = runTest {
        val vm = viewModel(startUserId = "a", posts = twoAuthors())
        vm.advance() // → group b, b1
        vm.back() // → previous group a, last slide
        assertThat(vm.state.value.authorName).isEqualTo("name-a")
        assertThat(vm.state.value.current?.id).isEqualTo("a1")
    }

    @Test
    fun `markCurrentViewed reports the current slide to the repository`() = runTest {
        val vm = viewModel(startUserId = "b", posts = twoAuthors())
        vm.markCurrentViewed()
        coVerify { storyRepository.markViewed("b1") }
    }

    @Test
    fun `reacting optimistically bumps the count, records mine, and calls the repository`() = runTest {
        val vm = viewModel(
            startUserId = "a",
            posts = listOf(storyPost("a1", "a", hoursAgo = 1, reactionSummary = mapOf("❤️" to 2))),
        )
        assertThat(vm.state.value.reactionCount).isEqualTo(2)

        vm.react("🔥")

        assertThat(vm.state.value.reactionCount).isEqualTo(3)
        assertThat(vm.state.value.myReactions).containsExactly("🔥")
        coVerify(exactly = 1) { storyRepository.react("a1", "🔥") }
    }

    @Test
    fun `a failed reaction rolls back the optimistic count and mine`() = runTest {
        val vm = viewModel(
            startUserId = "a",
            posts = listOf(storyPost("a1", "a", hoursAgo = 1, reactionSummary = mapOf("❤️" to 2))),
        )
        coEvery { storyRepository.react("a1", "🔥") } returns
            NetworkResult.Failure(me.meeshy.sdk.net.ApiError(message = "nope"))

        vm.react("🔥")

        assertThat(vm.state.value.reactionCount).isEqualTo(2)
        assertThat(vm.state.value.myReactions).isEmpty()
    }

    @Test
    fun `reacting twice with the same emoji is idempotent and hits the network once`() = runTest {
        val vm = viewModel(
            startUserId = "a",
            posts = listOf(storyPost("a1", "a", hoursAgo = 1)),
        )

        vm.react("🔥")
        vm.react("🔥")

        assertThat(vm.state.value.reactionCount).isEqualTo(1)
        assertThat(vm.state.value.myReactions).containsExactly("🔥")
        coVerify(exactly = 1) { storyRepository.react("a1", "🔥") }
    }

    @Test
    fun `reaction state is tracked per slide, not shared across the group`() = runTest {
        val vm = viewModel(startUserId = "b", posts = twoAuthors())
        vm.react("🔥") // on b1
        assertThat(vm.state.value.current?.id).isEqualTo("b1")
        assertThat(vm.state.value.reactionCount).isEqualTo(1)

        vm.advance() // → b2

        assertThat(vm.state.value.current?.id).isEqualTo("b2")
        assertThat(vm.state.value.reactionCount).isEqualTo(0)
        assertThat(vm.state.value.myReactions).isEmpty()
    }

    @Test
    fun `the viewer exposes the quick-reaction strip`() = runTest {
        val vm = viewModel(startUserId = "a", posts = twoAuthors())
        assertThat(vm.state.value.quickReactions)
            .containsExactlyElementsIn(me.meeshy.sdk.model.EmojiCatalog.defaultQuickReactions)
            .inOrder()
    }

    @Test
    fun `onSwipe NextGroup jumps to the next group's first slide`() = runTest {
        val vm = viewModel(startUserId = "a", posts = twoAuthors())
        assertThat(vm.state.value.authorName).isEqualTo("name-a")

        vm.onSwipe(StorySwipeAction.NextGroup)

        assertThat(vm.state.value.authorName).isEqualTo("name-b")
        assertThat(vm.state.value.current?.id).isEqualTo("b1")
        assertThat(vm.state.value.isDismissed).isFalse()
    }

    @Test
    fun `onSwipe PreviousGroup jumps back to the previous group's first slide`() = runTest {
        val vm = viewModel(startUserId = "b", posts = twoAuthors())
        vm.advance() // b1 → b2, mid-group

        vm.onSwipe(StorySwipeAction.PreviousGroup)

        assertThat(vm.state.value.authorName).isEqualTo("name-a")
        assertThat(vm.state.value.current?.id).isEqualTo("a1")
    }

    @Test
    fun `onSwipe Dismiss dismisses the viewer without changing the slide`() = runTest {
        val vm = viewModel(startUserId = "b", posts = twoAuthors())

        vm.onSwipe(StorySwipeAction.Dismiss)

        assertThat(vm.state.value.isDismissed).isTrue()
        assertThat(vm.state.value.current?.id).isEqualTo("b1")
    }

    @Test
    fun `onSwipe None leaves the state untouched`() = runTest {
        val vm = viewModel(startUserId = "a", posts = twoAuthors())
        val before = vm.state.value

        vm.onSwipe(StorySwipeAction.None)

        assertThat(vm.state.value).isEqualTo(before)
    }

    @Test
    fun `another user's realtime reaction bumps the current slide's count live`() = runTest {
        val vm = viewModel(
            startUserId = "a",
            posts = listOf(storyPost("a1", "a", hoursAgo = 1, reactionSummary = mapOf("❤️" to 2))),
        )
        assertThat(vm.state.value.reactionCount).isEqualTo(2)

        reactedFlow.emit(SocketStoryReactedData(storyId = "a1", userId = "stranger", emoji = "🔥"))

        assertThat(vm.state.value.reactionCount).isEqualTo(3)
        assertThat(vm.state.value.myReactions).isEmpty()
    }

    @Test
    fun `another user's realtime unreaction decrements the current slide's count`() = runTest {
        val vm = viewModel(
            startUserId = "a",
            posts = listOf(storyPost("a1", "a", hoursAgo = 1, reactionSummary = mapOf("❤️" to 2))),
        )

        unreactedFlow.emit(SocketStoryUnreactedData(storyId = "a1", userId = "stranger", emoji = "❤️"))

        assertThat(vm.state.value.reactionCount).isEqualTo(1)
    }

    @Test
    fun `the user's own reaction echo does not double-count the optimistic bump`() = runTest {
        val vm = viewModel(
            startUserId = "a",
            posts = listOf(storyPost("a1", "a", hoursAgo = 1, reactionSummary = mapOf("❤️" to 2))),
        )
        every { session.currentUserId } returns "me" // delta reads this lazily at echo time
        vm.react("🔥") // optimistic → 3, mine = {🔥}
        assertThat(vm.state.value.reactionCount).isEqualTo(3)

        reactedFlow.emit(SocketStoryReactedData(storyId = "a1", userId = "me", emoji = "🔥"))

        assertThat(vm.state.value.reactionCount).isEqualTo(3)
        assertThat(vm.state.value.myReactions).containsExactly("🔥")
    }

    @Test
    fun `a realtime reaction for a non-current slide is applied and shown after navigating`() = runTest {
        val vm = viewModel(startUserId = "b", posts = twoAuthors())
        assertThat(vm.state.value.current?.id).isEqualTo("b1")

        reactedFlow.emit(SocketStoryReactedData(storyId = "b2", userId = "stranger", emoji = "🔥"))
        // current slide (b1) is untouched
        assertThat(vm.state.value.reactionCount).isEqualTo(0)

        vm.advance() // → b2
        assertThat(vm.state.value.current?.id).isEqualTo("b2")
        assertThat(vm.state.value.reactionCount).isEqualTo(1)
    }

    @Test
    fun `a realtime reaction for an unknown story is ignored`() = runTest {
        val vm = viewModel(
            startUserId = "a",
            posts = listOf(storyPost("a1", "a", hoursAgo = 1, reactionSummary = mapOf("❤️" to 2))),
        )

        reactedFlow.emit(SocketStoryReactedData(storyId = "ghost", userId = "stranger", emoji = "🔥"))

        assertThat(vm.state.value.reactionCount).isEqualTo(2)
    }

    @Test
    fun `a failed load stops loading without dismissing`() = runTest {
        every { session.currentUser } returns MutableStateFlow<MeeshyUser?>(null)
        every { session.currentUserId } returns null
        coEvery { storyRepository.list(any(), any()) } returns
            NetworkResult.Failure(me.meeshy.sdk.net.ApiError(message = "boom"))
        val handle = SavedStateHandle(mapOf(StoryViewerViewModel.USER_ID_ARG to "a"))
        val vm = StoryViewerViewModel(storyRepository, session, socialSocket, config, handle)

        assertThat(vm.state.value.isLoading).isFalse()
        assertThat(vm.state.value.isDismissed).isFalse()
        assertThat(vm.state.value.slides).isEmpty()
    }

    @Test
    fun `currentStoryId tracks the visible slide`() = runTest {
        val vm = viewModel(startUserId = "a", posts = twoAuthors())
        assertThat(vm.state.value.currentStoryId).isEqualTo("a1")

        vm.advance() // → group b, b1

        assertThat(vm.state.value.currentStoryId).isEqualTo("b1")
    }

    @Test
    fun `isOwnStory is true only on the current user's own group`() = runTest {
        every { session.currentUser } returns MutableStateFlow<MeeshyUser?>(null)
        every { session.currentUserId } returns "a"
        coEvery { storyRepository.list(any(), any()) } returns NetworkResult.Success(twoAuthors())
        coEvery { storyRepository.markViewed(any()) } returns NetworkResult.Success(Unit)
        val handle = SavedStateHandle(mapOf(StoryViewerViewModel.USER_ID_ARG to "a"))
        val vm = StoryViewerViewModel(storyRepository, session, socialSocket, config, handle)

        assertThat(vm.state.value.isOwnStory).isTrue() // group a, author == current user

        vm.advance() // → group b (someone else's story)

        assertThat(vm.state.value.isOwnStory).isFalse()
    }

    private fun imagePost(id: String, authorId: String, hoursAgo: Long, imageUrl: String) =
        storyPost(id, authorId, hoursAgo).copy(
            media = listOf(ApiPostMedia(id = "m-$id", fileUrl = imageUrl)),
        )

    @Test
    fun `prefetchUrls warms the upcoming slide images of the current author`() = runTest {
        val posts = listOf(
            imagePost("a1", "a", hoursAgo = 3, imageUrl = "http://img/a1.jpg"),
            imagePost("a2", "a", hoursAgo = 2, imageUrl = "http://img/a2.jpg"),
            imagePost("a3", "a", hoursAgo = 1, imageUrl = "http://img/a3.jpg"),
        )
        val vm = viewModel(startUserId = "a", posts = posts)

        // At a1, the next two upcoming images are warmed.
        assertThat(vm.state.value.prefetchUrls)
            .containsExactly("http://img/a2.jpg", "http://img/a3.jpg").inOrder()
    }

    @Test
    fun `prefetchUrls shrinks as the viewer advances toward the end`() = runTest {
        val posts = listOf(
            imagePost("a1", "a", hoursAgo = 3, imageUrl = "http://img/a1.jpg"),
            imagePost("a2", "a", hoursAgo = 2, imageUrl = "http://img/a2.jpg"),
            imagePost("a3", "a", hoursAgo = 1, imageUrl = "http://img/a3.jpg"),
        )
        val vm = viewModel(startUserId = "a", posts = posts)

        vm.advance() // → a2, only a3 remains ahead
        assertThat(vm.state.value.prefetchUrls).containsExactly("http://img/a3.jpg")

        vm.advance() // → a3, the last slide, nothing to warm
        assertThat(vm.state.value.prefetchUrls).isEmpty()
    }

    @Test
    fun `a text-only slide can auto-advance immediately`() = runTest {
        val vm = viewModel(startUserId = "a", posts = twoAuthors())
        assertThat(vm.state.value.current?.imageUrl).isNull()
        assertThat(vm.state.value.canAutoAdvance).isTrue()
    }

    @Test
    fun `an image slide cannot auto-advance until its image resolves`() = runTest {
        val vm = viewModel(
            startUserId = "a",
            posts = listOf(imagePost("a1", "a", hoursAgo = 1, imageUrl = "http://img/a1.jpg")),
        )
        assertThat(vm.state.value.canAutoAdvance).isFalse()

        vm.onImageResolved("http://img/a1.jpg")

        assertThat(vm.state.value.canAutoAdvance).isTrue()
    }

    @Test
    fun `resolving an off-screen image leaves the current slide's gate closed`() = runTest {
        val posts = listOf(
            imagePost("a1", "a", hoursAgo = 2, imageUrl = "http://img/a1.jpg"),
            imagePost("a2", "a", hoursAgo = 1, imageUrl = "http://img/a2.jpg"),
        )
        val vm = viewModel(startUserId = "a", posts = posts)
        assertThat(vm.state.value.current?.id).isEqualTo("a1")

        vm.onImageResolved("http://img/a2.jpg") // prefetched, not the current slide

        assertThat(vm.state.value.canAutoAdvance).isFalse()
    }

    @Test
    fun `advancing to a new image slide re-closes the gate until that image resolves`() = runTest {
        val posts = listOf(
            imagePost("a1", "a", hoursAgo = 2, imageUrl = "http://img/a1.jpg"),
            imagePost("a2", "a", hoursAgo = 1, imageUrl = "http://img/a2.jpg"),
        )
        val vm = viewModel(startUserId = "a", posts = posts)
        vm.onImageResolved("http://img/a1.jpg")
        assertThat(vm.state.value.canAutoAdvance).isTrue()

        vm.advance() // → a2, not yet loaded
        assertThat(vm.state.value.current?.id).isEqualTo("a2")
        assertThat(vm.state.value.canAutoAdvance).isFalse()

        vm.onImageResolved("http://img/a2.jpg")
        assertThat(vm.state.value.canAutoAdvance).isTrue()
    }

    @Test
    fun `revisiting an already-resolved image keeps the gate open`() = runTest {
        val posts = listOf(
            imagePost("a1", "a", hoursAgo = 2, imageUrl = "http://img/a1.jpg"),
            imagePost("a2", "a", hoursAgo = 1, imageUrl = "http://img/a2.jpg"),
        )
        val vm = viewModel(startUserId = "a", posts = posts)
        vm.onImageResolved("http://img/a1.jpg")
        vm.advance() // → a2
        vm.onImageResolved("http://img/a2.jpg")

        vm.back() // → a1, already resolved earlier

        assertThat(vm.state.value.current?.id).isEqualTo("a1")
        assertThat(vm.state.value.canAutoAdvance).isTrue()
    }
}
