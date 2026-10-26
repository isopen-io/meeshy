package me.meeshy.sdk.community

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ApiCommunityMember
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.ApiCommunity
import me.meeshy.sdk.model.CommunityMini
import me.meeshy.sdk.model.Pagination
import me.meeshy.sdk.model.InviteMemberRequest
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.CommunityApi
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Test
import retrofit2.HttpException
import retrofit2.Response

class CommunityRepositoryTest {

    private val api = mockk<CommunityApi>()
    private val repository = CommunityRepository(api)

    private fun member(userId: String) =
        ApiResponse(success = true, data = ApiCommunityMember(id = "m-$userId", userId = userId))

    @Test
    fun `inviter plusieurs personnes envoie une invitation unitaire par id`() = runTest {
        coEvery { api.invite("c1", any()) } answers { member(secondArg<InviteMemberRequest>().userId) }

        val outcome = repository.inviteMany("c1", listOf("a", "b", "c"))

        assertThat(outcome.isSuccess).isTrue()
        assertThat(outcome.failed).isEqualTo(0)
        coVerify(exactly = 1) { api.invite("c1", InviteMemberRequest("a")) }
        coVerify(exactly = 1) { api.invite("c1", InviteMemberRequest("b")) }
        coVerify(exactly = 1) { api.invite("c1", InviteMemberRequest("c")) }
    }

    @Test
    fun `un echec n'abandonne pas les suivants et le bilan compte les echecs`() = runTest {
        coEvery { api.invite("c1", InviteMemberRequest("a")) } returns member("a")
        coEvery { api.invite("c1", InviteMemberRequest("b")) } returns ApiResponse(success = false, error = "refus")
        coEvery { api.invite("c1", InviteMemberRequest("c")) } throws java.io.IOException("réseau")
        coEvery { api.invite("c1", InviteMemberRequest("d")) } returns member("d")

        val outcome = repository.inviteMany("c1", listOf("a", "b", "c", "d"))

        assertThat(outcome.requested).isEqualTo(4)
        assertThat(outcome.failed).isEqualTo(2)
        assertThat(outcome.isSuccess).isFalse()
        coVerify(exactly = 1) { api.invite("c1", InviteMemberRequest("d")) }
    }

    @Test
    fun `une liste vide d'invites est un succes sans appel`() = runTest {
        val outcome = repository.inviteMany("c1", emptyList())

        assertThat(outcome.isSuccess).isTrue()
        coVerify(exactly = 0) { api.invite(any(), any()) }
    }

    @Test
    fun `mine demande les roles administrateur et moderateur`() = runTest {
        coEvery { api.mine("admin,moderator") } returns
            ApiResponse(success = true, data = listOf(CommunityMini(id = "c1", name = "A", memberCount = 2)))

        val result = repository.mine()

        assertThat((result as NetworkResult.Success).data.single().memberCount).isEqualTo(2)
    }

    @Test
    fun `un retrait refuse en 403 reste un echec local avec son statut`() = runTest {
        val denied = HttpException(
            Response.error<Any>(403, """{"success":false,"error":"forbidden"}""".toResponseBody("application/json".toMediaType())),
        )
        coEvery { api.removeMember("c1", "u1") } throws denied

        val result = repository.removeMember("c1", "u1")

        assertThat(result).isInstanceOf(NetworkResult.Failure::class.java)
        assertThat((result as NetworkResult.Failure).error.httpStatus).isEqualTo(403)
    }

    @Test
    fun `listPaged garde le bloc pagination et passe la recherche`() = runTest {
        coEvery { api.list(20, 20, "club") } returns ApiResponse(
            success = true,
            data = listOf(ApiCommunity(id = "c1")),
            pagination = Pagination(hasMore = true),
        )

        val result = repository.listPaged(search = "club", offset = 20, limit = 20)

        val page = (result as NetworkResult.Success).data
        assertThat(page.data.map { it.id }).containsExactly("c1")
        assertThat(page.pagination?.hasMore).isTrue()
    }

    @Test
    fun `getMembersPaged garde le bloc pagination`() = runTest {
        coEvery { api.getMembers("c1", 0, 30) } returns ApiResponse(
            success = true,
            data = listOf(ApiCommunityMember(id = "m1", userId = "u1")),
            pagination = Pagination(hasMore = false),
        )

        val page = (repository.getMembersPaged("c1", 0, 30) as NetworkResult.Success).data

        assertThat(page.pagination?.hasMore).isFalse()
    }
}
