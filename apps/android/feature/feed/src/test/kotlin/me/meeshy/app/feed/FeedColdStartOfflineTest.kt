package me.meeshy.app.feed

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
import me.meeshy.sdk.cache.KeyedJsonDocument
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.Pagination
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.api.PostApi
import me.meeshy.sdk.network.InMemoryNetworkMonitor
import me.meeshy.sdk.post.FeedDiskCache
import me.meeshy.sdk.post.PostRepository
import me.meeshy.sdk.publication.PublicationNotice
import me.meeshy.sdk.publication.PublicationOutbox
import me.meeshy.sdk.session.AccountTicket
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.SocialSocketManager
import org.junit.After
import org.junit.Before
import org.junit.Test
import java.io.IOException

/**
 * #14263, recette S8 — le chemin RÉEL : le fil ouvert en ligne par [FeedViewModel] garde sa page sur le disque, et le même
 * fil rouvert à froid sans réseau la montre. Le premier correctif écrivait le disque en suspendant le bloc qui venait de
 * publier la page en mémoire : le flux, relancé par cette publication, annulait l'écriture avant qu'elle n'atteigne Room.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class FeedColdStartOfflineTest {

    private val dispatcher = UnconfinedTestDispatcher()

    @Before fun setUp() = Dispatchers.setMain(dispatcher)

    @After fun tearDown() = Dispatchers.resetMain()

    /** Le disque de l'appareil, en mémoire : il survit aux deux ouvertures du fil et garde la page sans faire attendre. */
    private class DeviceDisk : FeedDiskCache {
        private var kept: KeyedJsonDocument<List<ApiPost>>? = null
        override suspend fun read(): KeyedJsonDocument<List<ApiPost>>? = kept
        override fun keep(posts: List<ApiPost>, ticket: AccountTicket?) {
            kept = KeyedJsonDocument(posts, System.currentTimeMillis())
        }
    }

    private val session: SessionRepository = mockk(relaxed = true) {
        every { currentUser } returns MutableStateFlow<MeeshyUser?>(null)
    }
    private val socialSocket: SocialSocketManager = mockk(relaxed = true) {
        every { postCreated } returns MutableSharedFlow()
        every { postDeleted } returns MutableSharedFlow()
        every { postLiked } returns MutableSharedFlow()
        every { postUnliked } returns MutableSharedFlow()
        every { postBookmarked } returns MutableSharedFlow()
        every { commentAdded } returns MutableSharedFlow()
        every { commentDeleted } returns MutableSharedFlow()
        every { postTranslationUpdated } returns MutableSharedFlow()
        every { mediaCaptionTranslationUpdated } returns MutableSharedFlow()
        every { postUpdated } returns MutableSharedFlow()
        every { postReposted } returns MutableSharedFlow()
    }
    private val publications: PublicationOutbox = mockk(relaxed = true) {
        every { notices } returns MutableSharedFlow<PublicationNotice>()
    }

    private fun gateway(online: Boolean): PostApi = mockk(relaxed = true) {
        if (online) {
            coEvery { getFeed(any(), any()) } returns ApiResponse(
                success = true,
                data = listOf(ApiPost(id = "p1", content = "Recette 14244"), ApiPost(id = "p2", content = "Bonjour")),
                pagination = Pagination(nextCursor = null, hasMore = false),
            )
        } else {
            coEvery { getFeed(any(), any()) } throws IOException("offline")
        }
    }

    private fun openFeed(disk: FeedDiskCache, online: Boolean): FeedViewModel = FeedViewModel(
        PostRepository(gateway(online), mockk(relaxed = true), mockk(relaxed = true), feedDisk = disk),
        session, socialSocket, MeeshyConfig(), mockk(relaxed = true), mockk(relaxed = true), mockk(relaxed = true),
        publications, InMemoryNetworkMonitor(initialOnline = online),
    )

    @Test
    fun `a feed opened online is read again after an offline cold start, under the offline band`() = runTest {
        val disk = DeviceDisk()
        val online = openFeed(disk, online = true)
        assertThat(online.state.value.posts.map { it.id }).containsExactly("p1", "p2").inOrder()

        val coldOffline = openFeed(disk, online = false).state.value

        assertThat(coldOffline.posts.map { it.id }).containsExactly("p1", "p2").inOrder()
        assertThat(coldOffline.body).isEqualTo(FeedBody.POSTS)
        assertThat(coldOffline.showsOfflineBand).isTrue()
        assertThat(coldOffline.notice).isNull()
    }

    @Test
    fun `offline with nothing kept, the feed says one thing, that it is offline and not loaded yet`() = runTest {
        val coldOffline = openFeed(DeviceDisk(), online = false).state.value

        assertThat(coldOffline.body).isEqualTo(FeedBody.OFFLINE_EMPTY)
        assertThat(coldOffline.showsOfflineBand).isFalse()
    }

    @Test
    fun `online, a feed that cannot load keeps its load error`() = runTest {
        val disk = DeviceDisk()
        val failing = FeedViewModel(
            PostRepository(gateway(online = false), mockk(relaxed = true), mockk(relaxed = true), feedDisk = disk),
            session, socialSocket, MeeshyConfig(), mockk(relaxed = true), mockk(relaxed = true), mockk(relaxed = true),
            publications, InMemoryNetworkMonitor(initialOnline = true),
        ).state.value

        assertThat(failing.body).isEqualTo(FeedBody.LOAD_ERROR)
        assertThat(failing.showsOfflineBand).isFalse()
    }
}
