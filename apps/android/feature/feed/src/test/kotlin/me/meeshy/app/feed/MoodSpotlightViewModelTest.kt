package me.meeshy.app.feed

import androidx.lifecycle.SavedStateHandle
import androidx.work.WorkManager
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.model.ApiAuthor
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.StatusEntry
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.outbox.OutOfThreadAdmission
import me.meeshy.sdk.outbox.OutOfThreadSendGate
import me.meeshy.sdk.post.PostRepository
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.user.UserRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

/** Cache d'abord (barres amis puis découverte), revalidation, humeur expirée ou absente, vue enregistrée une fois. */
@OptIn(ExperimentalCoroutinesApi::class)
class MoodSpotlightViewModelTest {

    private val dispatcher = UnconfinedTestDispatcher()

    @Before
    fun setUp() = Dispatchers.setMain(dispatcher)

    @After
    fun tearDown() = Dispatchers.resetMain()

    private val now = 1_800_000_000_000L
    private val future = "2030-01-01T00:00:00.000Z"
    private val past = "2020-01-01T00:00:00.000Z"

    private fun post(expiresAt: String? = future) = ApiPost(
        id = "mood-1", type = "STATUS", moodEmoji = "🌞", content = "Frais", expiresAt = expiresAt,
        author = ApiAuthor(id = "lea", username = "lea"),
    )

    private fun entry(expiresAt: String? = future) = StatusEntry(
        id = "mood-1", userId = "lea", username = "lea", moodEmoji = "🌞", content = "En cache", expiresAt = expiresAt,
    )

    private class Rig(val vm: MoodSpotlightViewModel, val posts: PostRepository)

    private fun rig(
        cached: StatusEntry? = null,
        network: NetworkResult<ApiPost> = NetworkResult.Success(post()),
        me: String = "me",
        statusId: String = "mood-1",
    ): Rig {
        val posts = mockk<PostRepository>(relaxed = true)
        every { posts.cachedPost(any()) } returns null
        coEvery { posts.getPost(any()) } returns network
        val users = mockk<UserRepository>(relaxed = true)
        coEvery { users.getProfile(any()) } returns NetworkResult.Failure(ApiError("offline"))
        val session = mockk<SessionRepository>(relaxed = true)
        every { session.currentUser } returns MutableStateFlow(MeeshyUser(id = me, username = me))
        every { session.currentUserId } returns me
        val vm = MoodSpotlightViewModel(
            posts, users, mockk<ConversationRepository>(relaxed = true), mockk<MessageRepository>(relaxed = true), session,
            mockk<WorkManager>(relaxed = true), OutOfThreadSendGate { OutOfThreadAdmission.SEND }, { now },
            SavedStateHandle(mapOf(MoodSpotlightViewModel.STATUS_ID_ARG to statusId)),
            statusCache = MoodStatusCache { cached },
        )
        return Rig(vm, posts)
    }

    @Test
    fun `une humeur gardee par les barres se montre puis le reseau la revalide`() = runTest {
        val r = rig(cached = entry())

        assertThat(r.vm.state.value.entry?.content).isEqualTo("Frais")
    }

    @Test
    fun `le reseau en panne laisse l humeur du cache a l ecran`() = runTest {
        val r = rig(cached = entry(), network = NetworkResult.Failure(ApiError("offline")))

        assertThat(r.vm.state.value.entry?.content).isEqualTo("En cache")
    }

    @Test
    fun `une humeur expiree est refusee meme en cache`() = runTest {
        val r = rig(cached = entry(expiresAt = past), network = NetworkResult.Failure(ApiError("offline")))

        assertThat(r.vm.state.value.content).isEqualTo(MoodSpotlightContent.Unavailable)
    }

    @Test
    fun `une humeur expiree cote reseau devient indisponible`() = runTest {
        val r = rig(cached = entry(), network = NetworkResult.Success(post(expiresAt = past)))

        assertThat(r.vm.state.value.content).isEqualTo(MoodSpotlightContent.Unavailable)
        assertThat(r.vm.state.value.canReply).isFalse()
    }

    @Test
    fun `une humeur introuvable sans cache est indisponible`() = runTest {
        val r = rig(network = NetworkResult.Failure(ApiError("404")))

        assertThat(r.vm.state.value.content).isEqualTo(MoodSpotlightContent.Unavailable)
    }

    @Test
    fun `la vue n est enregistree qu une fois malgre cache puis reseau`() = runTest {
        val r = rig(cached = entry())

        coVerify(exactly = 1) { r.posts.viewPost("mood-1") }
    }

    @Test
    fun `l auteur ne compte pas sa propre vue et ne peut pas se repondre`() = runTest {
        val r = rig(cached = entry(), me = "lea")

        coVerify(exactly = 0) { r.posts.viewPost(any()) }
        assertThat(r.vm.state.value.canReply).isFalse()
    }
}
