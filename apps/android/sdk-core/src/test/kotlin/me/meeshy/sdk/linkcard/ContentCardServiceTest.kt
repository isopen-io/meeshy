package me.meeshy.sdk.linkcard

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.cache.store.FakeClock
import me.meeshy.sdk.link.TrackedLinkRepository
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.PostType
import me.meeshy.sdk.model.ResolvedTrackedLink
import me.meeshy.sdk.model.contentcard.ContentLinkCardState
import me.meeshy.sdk.model.deeplink.ContentLinkTarget
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.post.PostRepository
import me.meeshy.sdk.session.SessionRepository
import org.junit.Test

/**
 * La carte de contenu lue en direct (#19331, contrat § 2 et § 3) : cache d'abord, verdict caché, panne sans effacement,
 * lien suivi résolu une seule fois et sans clic, clic compté au toucher.
 */
class ContentCardServiceTest {

    private val id = "66f0c0ffee0000000000c0de"
    private val direct = ContentLinkTarget.Content(id, PostType.POST)
    private val tracked = ContentLinkTarget.Tracked("Ab3xYz")
    private val post = ApiPost(id = id, type = "POST", content = "Bonjour", viewCount = 7)
    private val clock = FakeClock(now = 10_000_000L)

    private fun failure(status: Int?) = NetworkResult.Failure(ApiError(message = "refus", httpStatus = status))

    private fun posts(
        cached: ApiPost? = null,
        known: ApiPost? = null,
        read: NetworkResult<ApiPost> = NetworkResult.Success(post),
    ): PostRepository = mockk {
        every { cachedPost(any()) } returns cached
        coEvery { knownPost(any()) } returns known
        coEvery { getPost(any()) } returns read
    }

    private fun session(): SessionRepository = mockk {
        every { currentUser } returns MutableStateFlow<MeeshyUser?>(null)
    }

    private fun service(posts: PostRepository = posts(), links: TrackedLinkRepository = mockk(relaxed = true)) =
        ContentCardService(posts, links, session(), clock)

    private fun ContentLinkCardState.views(): Int? = (this as? ContentLinkCardState.Card)?.card?.stats?.views

    @Test
    fun `a post the feed already holds paints the card at its first frame`() {
        val state = service(posts(cached = post)).initial(direct)

        assertThat(state.views()).isEqualTo(7)
    }

    @Test
    fun `a cold card shows its skeleton, then the served post`() = runTest {
        val service = service()

        assertThat(service.initial(direct)).isEqualTo(ContentLinkCardState.Loading)
        val states = service.states(direct).toList()

        assertThat(states.first()).isEqualTo(ContentLinkCardState.Loading)
        assertThat(states.last().views()).isEqualTo(7)
    }

    @Test
    fun `a card read less than a minute ago is shown at once and not read again`() = runTest {
        val posts = posts()
        val service = service(posts)
        service.states(direct).toList()
        clock.now += 30_000

        assertThat(service.initial(direct).views()).isEqualTo(7)
        assertThat(service.states(direct).toList().map { it.views() }).containsExactly(7)
        coVerify(exactly = 1) { posts.getPost(id) }
    }

    @Test
    fun `a refused post is unavailable, with the genre the link announced`() = runTest {
        val states = service(posts(read = failure(404))).states(ContentLinkTarget.Content(id, PostType.REEL)).toList()

        assertThat(states.last()).isEqualTo(ContentLinkCardState.Unavailable(PostType.REEL))
    }

    @Test
    fun `a network failure on a cold card falls back to the generic preview`() = runTest {
        val states = service(posts(read = failure(null))).states(direct).toList()

        assertThat(states.last()).isEqualTo(ContentLinkCardState.Failed)
    }

    @Test
    fun `a network failure keeps the card the device already knew`() = runTest {
        val states = service(posts(known = post, read = failure(503))).states(direct).toList()

        assertThat(states.map { it.views() }).containsExactly(7, 7)
    }

    @Test
    fun `a stale card is served, then revalidated in silence`() = runTest {
        val fresher = post.copy(viewCount = 8)
        val posts = posts()
        val service = service(posts)
        service.states(direct).toList()
        clock.now += 120_000
        coEvery { posts.getPost(id) } returns NetworkResult.Success(fresher)

        assertThat(service.states(direct).toList().map { it.views() }).containsExactly(7, 8).inOrder()
    }

    @Test
    fun `a tracked link resolves once to its content, without counting a click`() = runTest {
        val links = mockk<TrackedLinkRepository>(relaxed = true)
        coEvery { links.resolve("Ab3xYz") } returns
            NetworkResult.Success(ResolvedTrackedLink(kind = "tracking", targetType = "POST", targetId = id))
        val service = service(links = links)

        assertThat(service.states(tracked).toList().last().views()).isEqualTo(7)
        assertThat(service.initial(tracked).views()).isEqualTo(7)
        coVerify(exactly = 1) { links.resolve("Ab3xYz") }
        coVerify(exactly = 0) { links.recordClick(any(), any()) }
    }

    @Test
    fun `a tracked link to a site is not a content card`() = runTest {
        val links = mockk<TrackedLinkRepository>(relaxed = true)
        coEvery { links.resolve("Ab3xYz") } returns
            NetworkResult.Success(ResolvedTrackedLink(kind = "tracking", targetType = "EXTERNAL", originalUrl = "https://example.org"))
        val service = service(links = links)

        assertThat(service.states(tracked).toList()).containsExactly(ContentLinkCardState.NotContent)
        assertThat(service.initial(tracked)).isEqualTo(ContentLinkCardState.NotContent)
    }

    @Test
    fun `a tracked link the server cannot reach falls back, and is asked again next time`() = runTest {
        val links = mockk<TrackedLinkRepository>(relaxed = true)
        coEvery { links.resolve("Ab3xYz") } returns failure(null)
        val service = service(links = links)

        assertThat(service.states(tracked).toList()).containsExactly(ContentLinkCardState.Failed)
        assertThat(service.initial(tracked)).isEqualTo(ContentLinkCardState.Loading)
    }

    @Test
    fun `opening a tracked card counts its click, a direct one counts nothing`() = runTest {
        val links = mockk<TrackedLinkRepository>(relaxed = true)
        val service = service(links = links)

        service.recordOpen(tracked)
        service.recordOpen(direct)

        coVerify(exactly = 1) { links.recordClick("Ab3xYz", any()) }
    }

    @Test
    fun `a change of account forgets every card`() = runTest {
        val service = service()
        service.states(direct).toList()

        service.clear()

        assertThat(service.initial(direct)).isEqualTo(ContentLinkCardState.Loading)
    }
}
