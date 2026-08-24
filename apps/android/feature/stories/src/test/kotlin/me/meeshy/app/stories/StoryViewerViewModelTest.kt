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
import me.meeshy.sdk.model.ApiPostTranslationEntry
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.SocketStoryReactedData
import me.meeshy.sdk.model.SocketStoryTranslationUpdatedData
import me.meeshy.sdk.model.SocketStoryUnreactedData
import me.meeshy.sdk.model.StoryAudioPlayerObject
import me.meeshy.sdk.model.StoryClipTransition
import me.meeshy.sdk.model.StoryEffects
import me.meeshy.sdk.model.StoryKeyframe
import me.meeshy.sdk.model.StoryMediaObject
import me.meeshy.sdk.model.StoryTextObject
import me.meeshy.sdk.model.StoryTransitionKind
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
    private val reportRepository: me.meeshy.sdk.report.ReportRepository = mockk(relaxed = true)
    private val session: SessionRepository = mockk(relaxed = true)
    private val reactedFlow = MutableSharedFlow<SocketStoryReactedData>(extraBufferCapacity = 8)
    private val unreactedFlow = MutableSharedFlow<SocketStoryUnreactedData>(extraBufferCapacity = 8)
    private val translationUpdatedFlow =
        MutableSharedFlow<SocketStoryTranslationUpdatedData>(extraBufferCapacity = 8)
    private val socialSocket: SocialSocketManager = mockk(relaxed = true) {
        every { storyReacted } returns reactedFlow
        every { storyUnreacted } returns unreactedFlow
        every { storyTranslationUpdated } returns translationUpdatedFlow
    }
    private val config = MeeshyConfig()

    private val now = Instant.parse("2026-06-17T12:00:00Z").toEpochMilli()
    private fun isoAgo(hours: Long) = Instant.ofEpochMilli(now - hours * 3_600_000).toString()

    private fun storyPost(
        id: String,
        authorId: String,
        hoursAgo: Long,
        reactionSummary: Map<String, Int>? = null,
        translations: Map<String, ApiPostTranslationEntry>? = null,
    ) = ApiPost(
        id = id,
        type = "STORY",
        content = "text-$id",
        createdAt = isoAgo(hoursAgo),
        author = ApiAuthor(id = authorId, username = "name-$authorId"),
        isViewedByMe = false,
        reactionSummary = reactionSummary,
        translations = translations,
    )

    private fun viewModel(
        startUserId: String,
        posts: List<ApiPost>,
        user: MeeshyUser? = null,
    ): StoryViewerViewModel {
        every { session.currentUser } returns MutableStateFlow(user)
        every { session.currentUserId } returns null
        coEvery { storyRepository.list(any(), any()) } returns NetworkResult.Success(posts)
        coEvery { storyRepository.markViewed(any()) } returns NetworkResult.Success(Unit)
        coEvery { storyRepository.react(any(), any()) } returns NetworkResult.Success(Unit)
        val handle = SavedStateHandle(mapOf(StoryViewerViewModel.USER_ID_ARG to startUserId))
        return StoryViewerViewModel(storyRepository, session, socialSocket, config, reportRepository, handle)
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
    fun `loading the viewer joins the current slide's realtime room`() = runTest {
        viewModel(startUserId = "a", posts = twoAuthors())

        coVerify(exactly = 1) { socialSocket.joinPostRoom("a1") }
    }

    @Test
    fun `advancing to a new slide leaves the old room and joins the new one`() = runTest {
        val vm = viewModel(startUserId = "b", posts = twoAuthors())
        coVerify(exactly = 1) { socialSocket.joinPostRoom("b1") }

        vm.advance() // b1 → b2

        coVerify(exactly = 1) { socialSocket.leavePostRoom("b1") }
        coVerify(exactly = 1) { socialSocket.joinPostRoom("b2") }
    }

    @Test
    fun `an emit that does not change the current slide never re-joins its room`() = runTest {
        val vm = viewModel(
            startUserId = "a",
            posts = listOf(storyPost("a1", "a", hoursAgo = 1, reactionSummary = mapOf("❤️" to 2))),
        )
        coVerify(exactly = 1) { socialSocket.joinPostRoom("a1") }

        vm.react("🔥") // re-emits without changing the current slide

        coVerify(exactly = 1) { socialSocket.joinPostRoom("a1") }
        coVerify(exactly = 0) { socialSocket.leavePostRoom(any()) }
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
        val vm = StoryViewerViewModel(storyRepository, session, socialSocket, config, reportRepository, handle)

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
        val vm = StoryViewerViewModel(storyRepository, session, socialSocket, config, reportRepository, handle)

        assertThat(vm.state.value.isOwnStory).isTrue() // group a, author == current user

        vm.advance() // → group b (someone else's story)

        assertThat(vm.state.value.isOwnStory).isFalse()
    }

    private fun imagePost(id: String, authorId: String, hoursAgo: Long, imageUrl: String) =
        storyPost(id, authorId, hoursAgo).copy(
            media = listOf(ApiPostMedia(id = "m-$id", fileUrl = imageUrl)),
        )

    // ---- background/foreground video + audio (Android story media parity) ----

    @Test
    fun `a background video mediaObject exposes backgroundVideoUrl and leaves imageUrl null`() = runTest {
        val post = storyPost("a1", "a", hoursAgo = 1).copy(
            media = listOf(ApiPostMedia(id = "m1", fileUrl = "http://cdn/bg.mp4", mimeType = "video/mp4")),
            storyEffects = StoryEffects(
                mediaObjects = listOf(
                    StoryMediaObject(
                        id = "obj1",
                        postMediaId = "m1",
                        mediaURL = "http://cdn/bg.mp4",
                        mediaType = "video",
                        isBackground = true,
                        loop = true,
                    ),
                ),
            ),
        )
        val vm = viewModel(startUserId = "a", posts = listOf(post))

        assertThat(vm.state.value.current?.backgroundVideoUrl).isEqualTo("http://cdn/bg.mp4")
        assertThat(vm.state.value.current?.imageUrl).isNull()
        assertThat(vm.state.value.current?.backgroundLoop).isTrue()
    }

    @Test
    fun `a legacy video-only story without storyEffects exposes backgroundVideoUrl, never a broken imageUrl`() = runTest {
        // Regression test: before the fix, the flat media[] fallback used the
        // VIDEO item's own `.url` as `imageUrl`, which AsyncImage/Coil cannot
        // decode — the slide painted nothing and no video ever played.
        val post = storyPost("a1", "a", hoursAgo = 1).copy(
            media = listOf(
                ApiPostMedia(
                    id = "m1",
                    fileUrl = "http://cdn/legacy.mp4",
                    mimeType = "video/mp4",
                    thumbnailUrl = "http://cdn/legacy_thumb.jpg",
                ),
            ),
            storyEffects = null,
        )
        val vm = viewModel(startUserId = "a", posts = listOf(post))

        assertThat(vm.state.value.current?.backgroundVideoUrl).isEqualTo("http://cdn/legacy.mp4")
        assertThat(vm.state.value.current?.imageUrl).isNull()
    }

    @Test
    fun `a background image mediaObject still resolves as imageUrl, not backgroundVideoUrl`() = runTest {
        val post = storyPost("a1", "a", hoursAgo = 1).copy(
            media = listOf(ApiPostMedia(id = "m1", fileUrl = "http://cdn/photo.jpg", mimeType = "image/jpeg")),
            storyEffects = StoryEffects(
                mediaObjects = listOf(
                    StoryMediaObject(
                        id = "obj1",
                        postMediaId = "m1",
                        mediaURL = "http://cdn/photo.jpg",
                        mediaType = "image",
                        isBackground = true,
                    ),
                ),
            ),
        )
        val vm = viewModel(startUserId = "a", posts = listOf(post))

        assertThat(vm.state.value.current?.imageUrl).isEqualTo("http://cdn/photo.jpg")
        assertThat(vm.state.value.current?.backgroundVideoUrl).isNull()
    }

    @Test
    fun `a non-background mediaObject is exposed as foreground media`() = runTest {
        val post = storyPost("a1", "a", hoursAgo = 1).copy(
            media = listOf(
                ApiPostMedia(id = "bg", fileUrl = "http://cdn/bg.jpg", mimeType = "image/jpeg"),
                ApiPostMedia(id = "fg", fileUrl = "http://cdn/fg.mp4", mimeType = "video/mp4"),
            ),
            storyEffects = StoryEffects(
                mediaObjects = listOf(
                    StoryMediaObject(
                        id = "bgObj",
                        postMediaId = "bg",
                        mediaURL = "http://cdn/bg.jpg",
                        mediaType = "image",
                        isBackground = true,
                    ),
                    StoryMediaObject(
                        id = "fgObj",
                        postMediaId = "fg",
                        mediaURL = "http://cdn/fg.mp4",
                        mediaType = "video",
                        isBackground = false,
                        x = 0.3,
                        y = 0.7,
                        scale = 0.5,
                        aspectRatio = 0.6,
                    ),
                ),
            ),
        )
        val vm = viewModel(startUserId = "a", posts = listOf(post))

        val fg = vm.state.value.current?.foregroundMedia.orEmpty()
        assertThat(fg).hasSize(1)
        assertThat(fg.first().url).isEqualTo("http://cdn/fg.mp4")
        assertThat(fg.first().isVideo).isTrue()
        assertThat(fg.first().x).isEqualTo(0.3)
        assertThat(fg.first().y).isEqualTo(0.7)
    }

    @Test
    fun `a foreground mediaObject carries its keyframes and startTime into the projection`() = runTest {
        val post = storyPost("a1", "a", hoursAgo = 1).copy(
            media = listOf(
                ApiPostMedia(id = "fg", fileUrl = "http://cdn/fg.mp4", mimeType = "video/mp4"),
            ),
            storyEffects = StoryEffects(
                mediaObjects = listOf(
                    StoryMediaObject(
                        id = "fgObj",
                        postMediaId = "fg",
                        mediaURL = "http://cdn/fg.mp4",
                        mediaType = "video",
                        isBackground = false,
                        x = 0.2,
                        y = 0.2,
                        startTime = 1.0,
                        keyframes = listOf(
                            StoryKeyframe(time = 0f, x = 0.2),
                            StoryKeyframe(time = 4f, x = 0.8),
                        ),
                    ),
                ),
            ),
        )
        val vm = viewModel(startUserId = "a", posts = listOf(post))

        val fg = vm.state.value.current?.foregroundMedia.orEmpty().first()
        assertThat(fg.startTime).isEqualTo(1.0)
        assertThat(fg.keyframes).hasSize(2)
        // The keyframes are live, not dropped: the layer animates across its window.
        assertThat(fg.animated(atSeconds = 1f).x).isWithin(1e-9).of(0.2)
        assertThat(fg.animated(atSeconds = 3f).x).isWithin(1e-9).of(0.5)
    }

    @Test
    fun `a foreground mediaObject carries the slide's clip transitions and fades on the ramp`() = runTest {
        val post = storyPost("a1", "a", hoursAgo = 1).copy(
            media = listOf(
                ApiPostMedia(id = "fg", fileUrl = "http://cdn/fg.mp4", mimeType = "video/mp4"),
            ),
            storyEffects = StoryEffects(
                mediaObjects = listOf(
                    StoryMediaObject(
                        id = "toClip",
                        postMediaId = "fg",
                        mediaURL = "http://cdn/fg.mp4",
                        mediaType = "video",
                        isBackground = false,
                        startTime = 3.0,
                        duration = 4.0,
                    ),
                ),
                clipTransitions = listOf(
                    StoryClipTransition(
                        id = "t1",
                        fromClipId = "fromClip",
                        toClipId = "toClip",
                        kind = StoryTransitionKind.CROSSFADE,
                        duration = 2f,
                    ),
                ),
            ),
        )
        val vm = viewModel(startUserId = "a", posts = listOf(post))

        val fg = vm.state.value.current?.foregroundMedia.orEmpty().first()
        assertThat(fg.id).isEqualTo("toClip")
        assertThat(fg.duration).isEqualTo(4.0)
        assertThat(fg.clipTransitions).hasSize(1)
        // The transition is live, not dropped: the incoming clip fades in across its window [3,5].
        assertThat(fg.animated(atSeconds = 3f).opacity).isWithin(1e-4).of(0.0)
        assertThat(fg.animated(atSeconds = 4f).opacity).isWithin(1e-4).of(0.5)
    }

    @Test
    fun `a foreground mediaObject carries its fadeIn fadeOut envelope into the projection`() = runTest {
        val post = storyPost("a1", "a", hoursAgo = 1).copy(
            media = listOf(
                ApiPostMedia(id = "fg", fileUrl = "http://cdn/fg.mp4", mimeType = "video/mp4"),
            ),
            storyEffects = StoryEffects(
                mediaObjects = listOf(
                    StoryMediaObject(
                        id = "fgObj",
                        postMediaId = "fg",
                        mediaURL = "http://cdn/fg.mp4",
                        mediaType = "video",
                        isBackground = false,
                        startTime = 0.0,
                        duration = 10.0,
                        fadeIn = 2.0,
                        fadeOut = 2.0,
                    ),
                ),
            ),
        )
        val vm = viewModel(startUserId = "a", posts = listOf(post))

        val fg = vm.state.value.current?.foregroundMedia.orEmpty().first()
        assertThat(fg.fadeIn).isEqualTo(2.0)
        assertThat(fg.fadeOut).isEqualTo(2.0)
        // The envelope is live, not dropped: the clip fades in over [0,2] and out over [8,10].
        assertThat(fg.animated(atSeconds = 1f).opacity).isWithin(1e-4).of(0.5)
        assertThat(fg.animated(atSeconds = 5f).opacity).isWithin(1e-4).of(1.0)
        assertThat(fg.animated(atSeconds = 9f).opacity).isWithin(1e-4).of(0.5)
    }

    @Test
    fun `a slide's text objects are projected into the view and animate their fade envelope`() = runTest {
        val post = storyPost("a1", "a", hoursAgo = 1).copy(
            storyEffects = StoryEffects(
                textObjects = listOf(
                    StoryTextObject(
                        id = "txt",
                        text = "Hello",
                        x = 0.4,
                        y = 0.6,
                        startTime = 0.0,
                        duration = 10.0,
                        fadeIn = 2.0,
                    ),
                ),
            ),
        )
        val vm = viewModel(startUserId = "a", posts = listOf(post))

        val texts = vm.state.value.current?.textObjects.orEmpty()
        assertThat(texts).hasSize(1)
        val text = texts.first()
        assertThat(text.id).isEqualTo("txt")
        assertThat(text.text).isEqualTo("Hello")
        assertThat(text.x).isEqualTo(0.4)
        assertThat(text.y).isEqualTo(0.6)
        // The fade envelope is live, not dropped: the object ramps in over its window [0,2].
        assertThat(text.animated(atSeconds = 1f).opacity).isWithin(1e-4).of(0.5)
        assertThat(text.animated(atSeconds = 5f).opacity).isWithin(1e-4).of(1.0)
    }

    @Test
    fun `a background audioPlayerObject resolves its URL via postMediaId into backgroundAudioUrl`() = runTest {
        val post = storyPost("a1", "a", hoursAgo = 1).copy(
            media = listOf(
                ApiPostMedia(id = "img", fileUrl = "http://cdn/photo.jpg", mimeType = "image/jpeg"),
                ApiPostMedia(id = "aud", fileUrl = "http://cdn/track.mp3", mimeType = "audio/mp4"),
            ),
            storyEffects = StoryEffects(
                mediaObjects = listOf(
                    StoryMediaObject(
                        id = "bgObj",
                        postMediaId = "img",
                        mediaURL = "http://cdn/photo.jpg",
                        mediaType = "image",
                        isBackground = true,
                    ),
                ),
                audioPlayerObjects = listOf(
                    StoryAudioPlayerObject(id = "audObj", postMediaId = "aud", isBackground = true),
                ),
            ),
        )
        val vm = viewModel(startUserId = "a", posts = listOf(post))

        assertThat(vm.state.value.current?.backgroundAudioUrl).isEqualTo("http://cdn/track.mp3")
    }

    @Test
    fun `a non-background audioPlayerObject is exposed as foregroundAudioUrl`() = runTest {
        val post = storyPost("a1", "a", hoursAgo = 1).copy(
            media = listOf(ApiPostMedia(id = "voice", fileUrl = "http://cdn/voice.mp3", mimeType = "audio/mp4")),
            storyEffects = StoryEffects(
                audioPlayerObjects = listOf(
                    StoryAudioPlayerObject(id = "voiceObj", postMediaId = "voice", isBackground = false),
                ),
            ),
        )
        val vm = viewModel(startUserId = "a", posts = listOf(post))

        assertThat(vm.state.value.current?.foregroundAudioUrl).isEqualTo("http://cdn/voice.mp3")
        assertThat(vm.state.value.current?.backgroundAudioUrl).isNull()
    }

    @Test
    fun `the story item's direct audioUrl is used as backgroundAudioUrl when no audioPlayerObjects exist`() = runTest {
        val post = storyPost("a1", "a", hoursAgo = 1).copy(audioUrl = "http://cdn/voice-direct.mp3")
        val vm = viewModel(startUserId = "a", posts = listOf(post))

        assertThat(vm.state.value.current?.backgroundAudioUrl).isEqualTo("http://cdn/voice-direct.mp3")
    }

    @Test
    fun `a background-video slide can auto-advance immediately, same as a text-only slide`() = runTest {
        val post = storyPost("a1", "a", hoursAgo = 1).copy(
            media = listOf(ApiPostMedia(id = "m1", fileUrl = "http://cdn/bg.mp4", mimeType = "video/mp4")),
            storyEffects = StoryEffects(
                mediaObjects = listOf(
                    StoryMediaObject(
                        id = "o1",
                        postMediaId = "m1",
                        mediaURL = "http://cdn/bg.mp4",
                        mediaType = "video",
                        isBackground = true,
                    ),
                ),
            ),
        )
        val vm = viewModel(startUserId = "a", posts = listOf(post))

        assertThat(vm.state.value.current?.imageUrl).isNull()
        assertThat(vm.state.value.canAutoAdvance).isTrue()
    }

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

    @Test
    fun `available languages list the slide translations with flags`() = runTest {
        val vm = viewModel(
            startUserId = "a1",
            posts = listOf(
                storyPost(
                    id = "s1", authorId = "a1", hoursAgo = 1,
                    translations = mapOf(
                        "fr" to ApiPostTranslationEntry(text = "bonjour"),
                        "es" to ApiPostTranslationEntry(text = "hola"),
                    ),
                ),
            ),
        )
        val languages = vm.state.value.availableLanguages
        assertThat(languages.map { it.code }).containsExactly("fr", "es")
        assertThat(languages.first { it.code == "fr" }.flag).isNotEmpty()
    }

    @Test
    fun `toggling a language override re-resolves the current slide text`() = runTest {
        val vm = viewModel(
            startUserId = "a1",
            posts = listOf(
                storyPost(
                    id = "s1", authorId = "a1", hoursAgo = 1,
                    translations = mapOf("es" to ApiPostTranslationEntry(text = "hola")),
                ),
            ),
        )
        vm.toggleLanguageOverride("es")
        assertThat(vm.state.value.current?.text).isEqualTo("hola")
        assertThat(vm.state.value.languageOverride).isEqualTo("es")
    }

    @Test
    fun `re-toggling the same language clears the override`() = runTest {
        val vm = viewModel(
            startUserId = "a1",
            posts = listOf(
                storyPost(
                    id = "s1", authorId = "a1", hoursAgo = 1,
                    translations = mapOf("es" to ApiPostTranslationEntry(text = "hola")),
                ),
            ),
        )
        vm.toggleLanguageOverride("es")
        vm.toggleLanguageOverride("es")
        assertThat(vm.state.value.current?.text).isEqualTo("text-s1")
        assertThat(vm.state.value.languageOverride).isNull()
    }

    @Test
    fun `advancing to another slide resets the override`() = runTest {
        val vm = viewModel(
            startUserId = "a1",
            posts = listOf(
                storyPost(
                    id = "s1", authorId = "a1", hoursAgo = 2,
                    translations = mapOf("es" to ApiPostTranslationEntry(text = "hola")),
                ),
                storyPost(id = "s2", authorId = "a1", hoursAgo = 1),
            ),
        )
        vm.toggleLanguageOverride("es")
        vm.advance()
        assertThat(vm.state.value.languageOverride).isNull()
        vm.back()
        assertThat(vm.state.value.current?.text).isEqualTo("text-s1")
    }

    @Test
    fun `toggling a language override re-resolves the current slide's text objects`() = runTest {
        val post = storyPost("s1", "a1", hoursAgo = 1).copy(
            storyEffects = StoryEffects(
                textObjects = listOf(
                    StoryTextObject(
                        id = "txt",
                        text = "Hello",
                        translations = mapOf("fr" to "Bonjour", "es" to "Hola"),
                    ),
                ),
            ),
        )
        val vm = viewModel(startUserId = "a1", user = viewer(systemLanguage = "fr"), posts = listOf(post))

        // Default projection follows the reader's chain (fr).
        assertThat(vm.state.value.current?.textObjects?.first()?.text).isEqualTo("Bonjour")

        vm.toggleLanguageOverride("es")
        assertThat(vm.state.value.current?.textObjects?.first()?.text).isEqualTo("Hola")

        // Re-tapping clears the override, returning the object to the automatic resolution.
        vm.toggleLanguageOverride("es")
        assertThat(vm.state.value.current?.textObjects?.first()?.text).isEqualTo("Bonjour")
    }

    @Test
    fun `a language override with no matching text-object translation falls back to the preferred chain`() = runTest {
        val post = storyPost("s1", "a1", hoursAgo = 1).copy(
            storyEffects = StoryEffects(
                textObjects = listOf(
                    StoryTextObject(id = "txt", text = "Hello", translations = mapOf("fr" to "Bonjour")),
                ),
            ),
        )
        val vm = viewModel(startUserId = "a1", user = viewer(systemLanguage = "fr"), posts = listOf(post))

        vm.toggleLanguageOverride("de")
        // No "de" text-object translation exists, so the reader's fr chain still resolves.
        assertThat(vm.state.value.current?.textObjects?.first()?.text).isEqualTo("Bonjour")
    }

    // --- Realtime overlay translation merge (story:translation-updated) ---

    @Test
    fun `a realtime overlay translation merges and repaints in the reader's language without a tap`() = runTest {
        val post = storyPost("s1", "a1", hoursAgo = 1).copy(
            storyEffects = StoryEffects(
                textObjects = listOf(StoryTextObject(id = "txt", text = "Hello")),
            ),
        )
        val vm = viewModel(startUserId = "a1", user = viewer(systemLanguage = "fr"), posts = listOf(post))

        // No fr translation yet: the overlay shows its original text.
        assertThat(vm.state.value.current?.textObjects?.first()?.text).isEqualTo("Hello")

        translationUpdatedFlow.emit(
            SocketStoryTranslationUpdatedData(
                postId = "s1",
                textObjectIndex = 0,
                translations = mapOf("fr" to "Bonjour"),
            ),
        )

        // The reader prefers fr, so the freshly-merged overlay translation repaints — no tap.
        assertThat(vm.state.value.current?.textObjects?.first()?.text).isEqualTo("Bonjour")
    }

    @Test
    fun `a realtime overlay translation surfaces as a present content chip`() = runTest {
        val post = storyPost("s1", "a1", hoursAgo = 1).copy(
            storyEffects = StoryEffects(
                textObjects = listOf(StoryTextObject(id = "txt", text = "Hello")),
            ),
        )
        val vm = viewModel(startUserId = "a1", user = viewer(systemLanguage = "en"), posts = listOf(post))

        // No translations anywhere → no language strip.
        assertThat(vm.state.value.availableLanguages).isEmpty()

        translationUpdatedFlow.emit(
            SocketStoryTranslationUpdatedData(
                postId = "s1",
                textObjectIndex = 0,
                translations = mapOf("es" to "Hola"),
            ),
        )

        val languages = vm.state.value.availableLanguages
        assertThat(languages.map { it.code }).contains("es")
        assertThat(languages.first { it.code == "es" }.isTranslatable).isFalse()
    }

    @Test
    fun `a realtime overlay translation for an unknown story is inert`() = runTest {
        val post = storyPost("s1", "a1", hoursAgo = 1).copy(
            storyEffects = StoryEffects(
                textObjects = listOf(StoryTextObject(id = "txt", text = "Hello")),
            ),
        )
        val vm = viewModel(startUserId = "a1", user = viewer(systemLanguage = "fr"), posts = listOf(post))

        translationUpdatedFlow.emit(
            SocketStoryTranslationUpdatedData(
                postId = "does-not-exist",
                textObjectIndex = 0,
                translations = mapOf("fr" to "Bonjour"),
            ),
        )

        assertThat(vm.state.value.current?.textObjects?.first()?.text).isEqualTo("Hello")
    }

    // --- On-demand story translation (the flag strip's request arm) ---

    private fun viewer(systemLanguage: String) =
        MeeshyUser(id = "me", username = "me", systemLanguage = systemLanguage)

    @Test
    fun `a configured absent language surfaces as a translatable option once the story is translated`() =
        runTest {
            val vm = viewModel(
                startUserId = "a1",
                user = viewer(systemLanguage = "en"),
                posts = listOf(
                    storyPost(
                        id = "s1", authorId = "a1", hoursAgo = 1,
                        translations = mapOf("es" to ApiPostTranslationEntry(text = "hola")),
                    ),
                ),
            )
            val languages = vm.state.value.availableLanguages
            assertThat(languages.map { it.code }).containsExactly("es", "en").inOrder()
            assertThat(languages.first { it.code == "es" }.isTranslatable).isFalse()
            assertThat(languages.first { it.code == "en" }.isTranslatable).isTrue()
        }

    @Test
    fun `no translatable options are offered when the story has no translations at all`() = runTest {
        val vm = viewModel(
            startUserId = "a1",
            user = viewer(systemLanguage = "en"),
            posts = listOf(storyPost(id = "s1", authorId = "a1", hoursAgo = 1)),
        )
        assertThat(vm.state.value.availableLanguages).isEmpty()
    }

    @Test
    fun `a present preferred language is never re-offered as translatable`() = runTest {
        val vm = viewModel(
            startUserId = "a1",
            user = viewer(systemLanguage = "es"),
            posts = listOf(
                storyPost(
                    id = "s1", authorId = "a1", hoursAgo = 1,
                    translations = mapOf("es" to ApiPostTranslationEntry(text = "hola")),
                ),
            ),
        )
        val languages = vm.state.value.availableLanguages
        assertThat(languages.map { it.code }).containsExactly("es")
        assertThat(languages.single().isTranslatable).isFalse()
    }

    // Requesting a SECONDARY configured language while the PRIMARY is already present:
    // Prisme auto-resolution would keep showing the primary, so the viewer only lands on
    // the requested language because the request switches the exploration override to it.
    @Test
    fun `requesting a translation for an absent language translates, merges, and switches to it`() =
        runTest {
            coEvery { storyRepository.translateStory(any(), "de") } answers {
                me.meeshy.sdk.model.StoryTranslationMerge.mergeTranslation(firstArg(), "de", "hallo")
            }
            val vm = viewModel(
                startUserId = "a1",
                user = MeeshyUser(
                    id = "me", username = "me",
                    systemLanguage = "en", regionalLanguage = "de",
                ),
                posts = listOf(
                    storyPost(
                        id = "s1", authorId = "a1", hoursAgo = 1,
                        translations = mapOf("en" to ApiPostTranslationEntry(text = "hi")),
                    ),
                ),
            )
            // Primary (en) is present, so the story already reads "hi"; de is the translatable arm.
            assertThat(vm.state.value.current?.text).isEqualTo("hi")
            assertThat(vm.state.value.availableLanguages.first { it.code == "de" }.isTranslatable).isTrue()

            vm.requestStoryTranslation("de")

            assertThat(vm.state.value.current?.text).isEqualTo("hallo")
            assertThat(vm.state.value.languageOverride).isEqualTo("de")
            assertThat(vm.state.value.availableLanguages.first { it.code == "de" }.isTranslatable).isFalse()
        }

    @Test
    fun `a failed translation request leaves the displayed text unchanged`() = runTest {
        coEvery { storyRepository.translateStory(any(), any()) } returns null
        val vm = viewModel(
            startUserId = "a1",
            user = viewer(systemLanguage = "en"),
            posts = listOf(
                storyPost(
                    id = "s1", authorId = "a1", hoursAgo = 1,
                    translations = mapOf("es" to ApiPostTranslationEntry(text = "hola")),
                ),
            ),
        )

        vm.requestStoryTranslation("en")

        assertThat(vm.state.value.current?.text).isEqualTo("text-s1")
        assertThat(vm.state.value.languageOverride).isNull()
    }

    @Test
    fun `a second in-flight request for the same language does not fire a duplicate`() = runTest {
        val gate = kotlinx.coroutines.CompletableDeferred<me.meeshy.sdk.model.StoryItem?>()
        coEvery { storyRepository.translateStory(any(), "en") } coAnswers { gate.await() }
        val vm = viewModel(
            startUserId = "a1",
            user = viewer(systemLanguage = "en"),
            posts = listOf(
                storyPost(
                    id = "s1", authorId = "a1", hoursAgo = 1,
                    translations = mapOf("es" to ApiPostTranslationEntry(text = "hola")),
                ),
            ),
        )

        vm.requestStoryTranslation("en")
        vm.requestStoryTranslation("en")
        gate.complete(null)

        coVerify(exactly = 1) { storyRepository.translateStory(any(), "en") }
    }

    // --- The language bar descends the Prisme over ALL slide content (§Cohérence) ---
    // A slide's translatable content is not just its caption: on-canvas text overlays
    // carry their own per-language translations. The exploration bar must surface every
    // language present across caption AND text objects, or a slide whose overlays are
    // translated but whose caption is not offers the reader no way to reach them.

    private fun storyWithTextObjectTranslations(
        captionTranslations: Map<String, ApiPostTranslationEntry>? = null,
        textObjectTranslations: Map<String, String>?,
    ) = storyPost(id = "s1", authorId = "a1", hoursAgo = 1, translations = captionTranslations).copy(
        storyEffects = StoryEffects(
            textObjects = listOf(
                StoryTextObject(id = "txt", text = "Hello", translations = textObjectTranslations),
            ),
        ),
    )

    @Test
    fun `a text-object-only translation language surfaces as a present content chip`() = runTest {
        val vm = viewModel(
            startUserId = "a1",
            user = viewer(systemLanguage = "fr"),
            posts = listOf(
                storyWithTextObjectTranslations(
                    textObjectTranslations = mapOf("es" to "Hola", "de" to "Hallo"),
                ),
            ),
        )

        val languages = vm.state.value.availableLanguages
        assertThat(languages.map { it.code }).containsAtLeast("es", "de")
        assertThat(languages.first { it.code == "es" }.isTranslatable).isFalse()
        assertThat(languages.first { it.code == "de" }.isTranslatable).isFalse()
    }

    @Test
    fun `caption and text-object languages are unioned with the caption first and no duplicates`() =
        runTest {
            val vm = viewModel(
                startUserId = "a1",
                user = viewer(systemLanguage = "fr"),
                posts = listOf(
                    storyWithTextObjectTranslations(
                        captionTranslations = mapOf("es" to ApiPostTranslationEntry(text = "hola")),
                        textObjectTranslations = mapOf("es" to "Hola", "de" to "Hallo"),
                    ),
                ),
            )

            val present = vm.state.value.availableLanguages.filter { !it.isTranslatable }
            // es (caption + overlay) appears once, ahead of the overlay-only de.
            assertThat(present.map { it.code }).containsExactly("es", "de").inOrder()
        }

    @Test
    fun `a blank text-object translation value is not offered as a language`() = runTest {
        val vm = viewModel(
            startUserId = "a1",
            user = viewer(systemLanguage = "fr"),
            posts = listOf(
                storyWithTextObjectTranslations(
                    textObjectTranslations = mapOf("de" to "   ", "es" to "Hola"),
                ),
            ),
        )

        val codes = vm.state.value.availableLanguages.map { it.code }
        assertThat(codes).contains("es")
        assertThat(codes).doesNotContain("de")
    }

    @Test
    fun `an overlay-only translated story still offers a configured absent language as translatable`() =
        runTest {
            val vm = viewModel(
                startUserId = "a1",
                user = viewer(systemLanguage = "en"),
                posts = listOf(
                    storyWithTextObjectTranslations(
                        textObjectTranslations = mapOf("es" to "Hola"),
                    ),
                ),
            )

            val languages = vm.state.value.availableLanguages
            assertThat(languages.first { it.code == "es" }.isTranslatable).isFalse()
            assertThat(languages.first { it.code == "en" }.isTranslatable).isTrue()
        }

    @Test
    fun `tapping an overlay-only present language re-resolves the overlays into it`() = runTest {
        val vm = viewModel(
            startUserId = "a1",
            user = viewer(systemLanguage = "fr"),
            posts = listOf(
                storyWithTextObjectTranslations(
                    textObjectTranslations = mapOf("de" to "Hallo"),
                ),
            ),
        )
        // The chip is offered even though no caption or fr translation exists…
        assertThat(vm.state.value.availableLanguages.map { it.code }).contains("de")
        assertThat(vm.state.value.current?.textObjects?.first()?.text).isEqualTo("Hello")

        vm.toggleLanguageOverride("de")

        // …and it is actionable: the overlay repaints in the tapped language.
        assertThat(vm.state.value.current?.textObjects?.first()?.text).isEqualTo("Hallo")
    }
}
