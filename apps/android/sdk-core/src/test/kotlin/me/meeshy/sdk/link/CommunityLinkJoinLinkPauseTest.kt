package me.meeshy.sdk.link

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.builtins.ListSerializer
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.CommunityMini
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.CommunityApi
import me.meeshy.sdk.net.api.CommunityJoinLinkState
import me.meeshy.sdk.net.api.CommunityJoinLinkStateRequest
import me.meeshy.sdk.net.api.CommunityLinksApi
import org.junit.Test

/**
 * La fiche Android du lien d'une communauté lit l'état de pause dans `GET /communities/mine` et l'écrit par
 * `PUT /communities/:id/join-link` (#20255) — comme `CommunityLinkService` sur iOS.
 */
class CommunityLinkJoinLinkPauseTest {

    private class Mine(val served: List<CommunityMini>) : CommunityLinksApi {
        override suspend fun mine(role: String) = ApiResponse(success = true, data = served)
    }

    private fun repository(served: List<CommunityMini> = emptyList(), communities: CommunityApi = mockk()) =
        CommunityLinkRepository(Mine(served), MeeshyConfig(), communities)

    private fun minis(wire: String): List<CommunityMini> =
        MeeshyApi.json.decodeFromString(ApiResponse.serializer(ListSerializer(CommunityMini.serializer())), wire).data!!

    @Test
    fun `la liste porte l'etat de pause que la passerelle sert`() = runTest {
        val served = minis(
            """{"success":true,"data":[
                {"id":"c1","name":"Club","identifier":"mshy-club","isActive":true,"joinLinkPaused":true},
                {"id":"c2","name":"Cafe","identifier":"mshy-cafe","isActive":true,"joinLinkPaused":false}
            ]}""",
        )

        val links = (repository(served).listCommunityLinks() as NetworkResult.Success).data

        assertThat(links.map { it.joinLinkPaused }).containsExactly(true, false).inOrder()
    }

    @Test
    fun `une passerelle plus ancienne ne sert pas l'etat et la liste le dit inconnu`() = runTest {
        val served = minis("""{"success":true,"data":[{"id":"c1","name":"Club","identifier":"mshy-club","isActive":true}]}""")

        val links = (repository(served).listCommunityLinks() as NetworkResult.Success).data

        assertThat(links.single().joinLinkPaused).isNull()
    }

    @Test
    fun `mettre en pause ecrit paused et rend l'etat ecrit par la passerelle`() = runTest {
        val communities = mockk<CommunityApi>()
        coEvery { communities.setJoinLinkState("c1", CommunityJoinLinkStateRequest(paused = true)) } returns
            ApiResponse(success = true, data = CommunityJoinLinkState(joinLinkPausedAt = "2026-11-22T08:00:00.000Z"))

        val result = repository(communities = communities).setJoinLinkPaused(communityId = "c1", paused = true)

        assertThat(result).isEqualTo(NetworkResult.Success(true))
        coVerify(exactly = 1) { communities.setJoinLinkState("c1", CommunityJoinLinkStateRequest(paused = true)) }
    }

    @Test
    fun `relancer le lien rend un etat actif quand l'instant servi est nul`() = runTest {
        val communities = mockk<CommunityApi>()
        coEvery { communities.setJoinLinkState("c1", CommunityJoinLinkStateRequest(paused = false)) } returns
            ApiResponse(success = true, data = CommunityJoinLinkState(joinLinkPausedAt = null))

        val result = repository(communities = communities).setJoinLinkPaused(communityId = "c1", paused = false)

        assertThat(result).isEqualTo(NetworkResult.Success(false))
    }

    @Test
    fun `un refus de la passerelle remonte en echec`() = runTest {
        val communities = mockk<CommunityApi>()
        coEvery { communities.setJoinLinkState(any(), any()) } returns ApiResponse(success = false)

        val result = repository(communities = communities).setJoinLinkPaused(communityId = "c1", paused = true)

        assertThat(result).isInstanceOf(NetworkResult.Failure::class.java)
    }
}
