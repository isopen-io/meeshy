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
import me.meeshy.sdk.net.api.ShareLinkApi
import me.meeshy.sdk.net.api.WorldApi
import me.meeshy.sdk.session.AnonymousSessionRepository
import me.meeshy.sdk.session.InMemoryAnonymousSessionStore
import org.junit.Test

class WorldEntryMemoryTest {

    private class CountingApi(private val served: Boolean) : WorldApi {
        var reads = 0
        override suspend fun entry(): ApiResponse<WorldEntry> {
            reads++
            return if (served) ApiResponse(success = true, data = WorldEntry("w", "World", "mshy_w")) else ApiResponse(success = false)
        }

        override suspend fun joinAsGuest(key: String, body: LinkMembershipRequest): ApiResponse<LinkMembershipResponse> =
            ApiResponse(success = false)
    }

    private object NoShareLinks : ShareLinkApi {
        override suspend fun getLinkInfo(identifier: String): ApiResponse<ShareLinkInfo> = ApiResponse(success = false)
        override suspend fun joinAnonymously(linkId: String, body: AnonymousJoinRequest): ApiResponse<AnonymousJoinResponse> =
            ApiResponse(success = false)
        override suspend fun leaveAnonymously(body: LeaveAnonymousRequest): ApiResponse<Unit> = ApiResponse(success = true, data = Unit)
    }

    private fun memory(api: CountingApi) = WorldEntryMemory(
        WorldEntryRepository(api, AnonymousSessionRepository(NoShareLinks, InMemoryAnonymousSessionStore(), InMemoryTokenStore())),
    )

    @Test
    fun `l'entree est lue une seule fois par lancement`() = runTest {
        val api = CountingApi(served = true)
        val memory = memory(api)
        assertThat(memory.load()?.shareLinkIdentifier).isEqualTo("mshy_w")
        memory.load()
        assertThat(api.reads).isEqualTo(1)
    }

    @Test
    fun `un echec ne memorise rien et la prochaine ouverture reessaie`() = runTest {
        val api = CountingApi(served = false)
        val memory = memory(api)
        assertThat(memory.load()).isNull()
        memory.load()
        assertThat(api.reads).isEqualTo(2)
    }
}
