package me.meeshy.sdk.world

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.AnonymousJoinRequest
import me.meeshy.sdk.model.AnonymousJoinResponse
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.LeaveAnonymousRequest
import me.meeshy.sdk.model.ShareLinkInfo
import me.meeshy.sdk.model.world.LinkMembershipRequest
import me.meeshy.sdk.model.world.LinkMembershipResponse
import me.meeshy.sdk.model.world.WorldEntry
import me.meeshy.sdk.net.InMemoryTokenStore
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.ShareLinkApi
import me.meeshy.sdk.net.api.WorldApi
import me.meeshy.sdk.session.AnonymousSessionRepository
import me.meeshy.sdk.session.InMemoryAnonymousSessionStore
import org.junit.Test

class WorldEntryRepositoryTest {

    private class FakeWorldApi(var join: ApiResponse<LinkMembershipResponse>) : WorldApi {
        val joins = mutableListOf<Triple<String, String, String>>()
        override suspend fun entry() = ApiResponse(
            success = true,
            data = WorldEntry(identifier = "world", title = "World Wide", shareLinkIdentifier = "mshy_w"),
        )

        override suspend fun joinAsGuest(key: String, body: LinkMembershipRequest): ApiResponse<LinkMembershipResponse> {
            joins += Triple(key, body.nickname, body.language)
            return join
        }
    }

    private object NoShareLinks : ShareLinkApi {
        override suspend fun getLinkInfo(identifier: String): ApiResponse<ShareLinkInfo> = ApiResponse(success = false)
        override suspend fun joinAnonymously(linkId: String, body: AnonymousJoinRequest): ApiResponse<AnonymousJoinResponse> =
            ApiResponse(success = false)
        override suspend fun leaveAnonymously(body: LeaveAnonymousRequest): ApiResponse<Unit> = ApiResponse(success = true, data = Unit)
    }

    private val store = InMemoryAnonymousSessionStore()
    private val tokens = InMemoryTokenStore()
    private fun repository(api: FakeWorldApi) =
        WorldEntryRepository(api, AnonymousSessionRepository(NoShareLinks, store, tokens))

    @Test
    fun `la jonction forme une session posee comme toute session invitee`() = runTest {
        val api = FakeWorldApi(
            ApiResponse(success = true, data = LinkMembershipResponse(sessionToken = "tok", conversationId = "c1", participantId = "p1")),
        )

        val result = repository(api).joinAsGuest("mshy_w", "Amina", "pt")

        assertThat(api.joins).containsExactly(Triple("mshy_w", "Amina", "pt"))
        assertThat((result as NetworkResult.Success).data.conversationId).isEqualTo("c1")
        assertThat(tokens.sessionToken).isEqualTo("tok")
        assertThat(store.load()?.linkId).isEqualTo("mshy_w")
    }

    @Test
    fun `une reponse sans jeton n'installe rien`() = runTest {
        val api = FakeWorldApi(
            ApiResponse(success = true, data = LinkMembershipResponse(sessionToken = null, conversationId = "c1", participantId = "p1")),
        )

        val result = repository(api).joinAsGuest("mshy_w", "Amina", "fr")

        assertThat(result).isInstanceOf(NetworkResult.Failure::class.java)
        assertThat(tokens.sessionToken).isNull()
        assertThat(store.load()).isNull()
    }
}
