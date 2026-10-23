package me.meeshy.app.calls

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.appearance.AppearanceCatalogLoader
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiParticipant
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.ServedProfileDecor
import me.meeshy.sdk.model.ServedProfileDecorItem
import me.meeshy.sdk.model.appearance.AppearanceCatalog
import me.meeshy.sdk.model.appearance.AvatarRingDesign
import me.meeshy.sdk.model.appearance.AvatarRingStroke
import me.meeshy.sdk.model.appearance.RingStrokeStyle
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.user.UserRepository
import org.junit.Test

/**
 * Le visuel du correspondant que l'écran d'appel affiche (#12335) : la photo du cache d'abord,
 * puis la bannière et le contour équipé du profil public, toutes adresses admises par la
 * politique média.
 */
class CallPeerVisualResolverTest {

    private val conversations: ConversationRepository = mockk()
    private val users: UserRepository = mockk()
    private val catalogLoader: AppearanceCatalogLoader = mockk()
    private val catalog: AppearanceCatalog = mockk()
    private val session: SessionRepository = mockk {
        every { currentUser } returns MutableStateFlow(MeeshyUser(id = SELF, username = "moi"))
    }

    private fun resolver() = CallPeerVisualResolver(
        conversations = conversations,
        users = users,
        catalog = catalogLoader,
        session = session,
        meeshyConfig = MeeshyConfig(apiBaseUrl = "https://staging.meeshy.me/api/v1/"),
    )

    private fun direct(peerAvatar: String? = "https://staging.meeshy.me/u/bob-thumb.jpg") = ApiConversation(
        id = CONVERSATION,
        type = "direct",
        participants = listOf(
            ApiParticipant(id = "p-self", userId = SELF, displayName = "Moi"),
            ApiParticipant(id = "p-bob", userId = PEER, displayName = "Bob", avatar = peerAvatar),
        ),
    )

    private val ring = AvatarRingDesign(
        key = "aurore",
        stroke = AvatarRingStroke(style = RingStrokeStyle.SOLID, width = 0.06, colors = listOf("#FF00AA")),
    )

    private fun bob(decor: ServedProfileDecor? = ServedProfileDecor(avatarRing = ServedProfileDecorItem("lumieres", "aurore"))) =
        MeeshyUser(
            id = PEER,
            username = "bob",
            avatar = "https://staging.meeshy.me/u/bob.jpg",
            banner = "https://staging.meeshy.me/u/bob-banner.jpg",
            profileDecor = decor,
        )

    private val outgoingAudio = CallConfig(
        peerId = "", peerName = "Bob", isVideo = false, isOutgoing = true, conversationId = CONVERSATION,
    )

    @Test
    fun `the cached photo shows first, then the profile brings the banner and the equipped ring`() = runTest {
        coEvery { conversations.cachedById(CONVERSATION) } returns direct()
        coEvery { users.getProfile(PEER) } returns NetworkResult.Success(bob())
        coEvery { catalogLoader.catalog() } returns catalog
        every { catalog.ring("lumieres", "aurore") } returns ring

        resolver().visualFor(outgoingAudio).test {
            assertThat(awaitItem()).isEqualTo(CallPeerVisual(avatarUrl = "https://staging.meeshy.me/u/bob-thumb.jpg"))
            val full = awaitItem()
            assertThat(full.avatarUrl).isEqualTo("https://staging.meeshy.me/u/bob.jpg")
            assertThat(full.bannerUrl).isEqualTo("https://staging.meeshy.me/u/bob-banner.jpg")
            assertThat(full.backdropUrl).isEqualTo("https://staging.meeshy.me/u/bob-banner.jpg")
            assertThat(full.ring).isEqualTo(ring)
            awaitComplete()
        }
    }

    @Test
    fun `a conversation absent from the cache is read from the network to find the peer`() = runTest {
        coEvery { conversations.cachedById(CONVERSATION) } returns null
        coEvery { conversations.getById(CONVERSATION) } returns NetworkResult.Success(direct(peerAvatar = null))
        coEvery { users.getProfile(PEER) } returns NetworkResult.Success(bob(decor = null))

        resolver().visualFor(outgoingAudio).test {
            val full = awaitItem()
            assertThat(full.avatarUrl).isEqualTo("https://staging.meeshy.me/u/bob.jpg")
            assertThat(full.ring).isNull()
            awaitComplete()
        }
    }

    @Test
    fun `a failed profile read keeps the cached photo`() = runTest {
        coEvery { conversations.cachedById(CONVERSATION) } returns direct()
        coEvery { users.getProfile(PEER) } returns NetworkResult.Failure(ApiError("hors ligne"))

        resolver().visualFor(outgoingAudio).test {
            assertThat(awaitItem().avatarUrl).isEqualTo("https://staging.meeshy.me/u/bob-thumb.jpg")
            awaitComplete()
        }
    }

    @Test
    fun `a peer id carried by the call is used even without a conversation`() = runTest {
        coEvery { users.getProfile(PEER) } returns NetworkResult.Success(bob(decor = null))
        val incoming = CallConfig(peerId = PEER, peerName = "Bob", isVideo = false, isOutgoing = false, callId = "c1")

        resolver().visualFor(incoming).test {
            assertThat(awaitItem().bannerUrl).isEqualTo("https://staging.meeshy.me/u/bob-banner.jpg")
            awaitComplete()
        }
        coVerify(exactly = 0) { conversations.cachedById(any()) }
    }

    @Test
    fun `an address the media policy refuses never reaches the screen`() = runTest {
        coEvery { conversations.cachedById(CONVERSATION) } returns direct(peerAvatar = "http://10.0.0.5/bob.jpg")
        coEvery { users.getProfile(PEER) } returns NetworkResult.Success(
            bob(decor = null).copy(avatar = "javascript:alert(1)", banner = "http://192.168.1.2/b.jpg"),
        )

        resolver().visualFor(outgoingAudio).test {
            assertThat(awaitItem()).isEqualTo(CallPeerVisual.EMPTY)
            awaitComplete()
        }
    }

    @Test
    fun `a relative address is resolved against the gateway`() = runTest {
        coEvery { conversations.cachedById(CONVERSATION) } returns direct(peerAvatar = "/api/v1/attachments/file/bob.jpg")
        coEvery { users.getProfile(PEER) } returns NetworkResult.Failure(ApiError("hors ligne"))

        resolver().visualFor(outgoingAudio).test {
            assertThat(awaitItem().avatarUrl).startsWith("https://staging.meeshy.me/")
            awaitComplete()
        }
    }

    private companion object {
        const val SELF = "68b0000000000000000000aa"
        const val PEER = "68b0000000000000000000bb"
        const val CONVERSATION = "68b0000000000000000000cc"
    }
}
