package me.meeshy.sdk.community

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ApiCommunityJoinRequest
import me.meeshy.sdk.model.ApiCommunityMember
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.CommunityJoinRequestDecision
import me.meeshy.sdk.model.CommunityJoinRequestRejected
import me.meeshy.sdk.model.Pagination
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.CommunityApi
import org.junit.Test

/** Les demandes d'entrée lues et tranchées par les intendants (#19878). */
class CommunityJoinRequestsRepositoryTest {

    private val api = mockk<CommunityApi>()
    private val repository = CommunityRepository(api)

    private fun row(id: String, status: String? = "pending") =
        ApiCommunityJoinRequest(id = id, userId = "u-$id", status = status, createdAt = "2026-11-20T10:00:00.000Z")

    @Test
    fun `une page rend ses lignes lisibles et son curseur tant qu il en reste`() = runTest {
        coEvery { api.joinRequests("c1", 50, null) } returns
            ApiResponse(success = true, data = listOf(row("r1"), row("", null), row("r2", "accepted")), pagination = Pagination(hasMore = true, nextCursor = "r2"))

        val page = (repository.joinRequests("c1") as NetworkResult.Success).data

        assertThat(page.data.map { it.id }).containsExactly("r1")
        assertThat(page.nextCursor).isEqualTo("r2")
    }

    @Test
    fun `un curseur servi sans suite n est pas une page suivante`() = runTest {
        coEvery { api.joinRequests("c1", 50, "r1") } returns
            ApiResponse(success = true, data = listOf(row("r2")), pagination = Pagination(hasMore = false, nextCursor = "r2"))

        val page = (repository.joinRequests("c1", cursor = "r1") as NetworkResult.Success).data

        assertThat(page.nextCursor).isNull()
    }

    @Test
    fun `accepter rend le membre entre, refuser ne rend personne`() = runTest {
        coEvery { api.acceptJoinRequest("c1", "r1") } returns ApiResponse(success = true, data = ApiCommunityMember(id = "m1", userId = "u1"))
        coEvery { api.rejectJoinRequest("c1", "r2") } returns ApiResponse(success = true, data = CommunityJoinRequestRejected("r2", "rejected"))

        val accepted = repository.decideJoinRequest("c1", "r1", CommunityJoinRequestDecision.ACCEPT)
        val rejected = repository.decideJoinRequest("c1", "r2", CommunityJoinRequestDecision.REJECT)

        assertThat((accepted as NetworkResult.Success).data?.userId).isEqualTo("u1")
        assertThat(rejected).isEqualTo(NetworkResult.Success(null))
        coVerify(exactly = 0) { api.rejectJoinRequest("c1", "r1") }
        coVerify(exactly = 0) { api.acceptJoinRequest("c1", "r2") }
    }
}
