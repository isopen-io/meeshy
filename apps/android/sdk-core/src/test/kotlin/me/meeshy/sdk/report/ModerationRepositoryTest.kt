package me.meeshy.sdk.report

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.ContentRemovalRequest
import me.meeshy.sdk.model.DeletionAcknowledgement
import me.meeshy.sdk.model.ModeratorPermissions
import me.meeshy.sdk.model.MyPermissions
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.AdminApi
import me.meeshy.sdk.net.api.ContentRemovalClient
import me.meeshy.sdk.session.SessionRepository
import org.junit.Test

class ModerationRepositoryTest {

    private fun sessionWith(userId: String?): SessionRepository {
        val session = mockk<SessionRepository>(relaxed = true)
        coEvery { session.currentUserId } returns userId
        return session
    }

    private fun repo(admin: AdminApi, removal: ContentRemovalClient, userId: String? = "me") =
        ModerationRepository(admin, removal, sessionWith(userId))

    private fun adminReturning(response: ApiResponse<MyPermissions>): AdminApi {
        val api = mockk<AdminApi>()
        coEvery { api.myPermissions() } returns response
        return api
    }

    @Test
    fun `un moderateur ouvre l acces au retrait`() = runTest {
        val mine = MyPermissions("MODERATOR", ModeratorPermissions(canModerateContent = true))
        val repo = repo(adminReturning(ApiResponse(success = true, data = mine)), mockk())

        assertThat(repo.access().canRemoveContent).isTrue()
    }

    @Test
    fun `sans droit lu aucun acces n est ouvert`() = runTest {
        val denied = adminReturning(ApiResponse(success = false, error = "boom"))
        val plain = adminReturning(ApiResponse(success = true, data = MyPermissions("USER")))
        val api = mockk<AdminApi>(relaxed = true)

        assertThat(repo(denied, mockk()).access().canRemoveContent).isFalse()
        assertThat(repo(plain, mockk()).access().canRemoveContent).isFalse()
        assertThat(repo(api, mockk(), userId = null).access().canRemoveContent).isFalse()
        coVerify(exactly = 0) { api.myPermissions() }
    }

    @Test
    fun `un retrait avec motif envoie le corps reason`() = runTest {
        val removal = mockk<ContentRemovalClient>()
        coEvery { removal.removeMessage("m1", ContentRemovalRequest("spam")) } returns
            NetworkResult.Success(DeletionAcknowledgement())

        val result = repo(mockk(), removal).removeMessage(" m1 ", " spam ")

        assertThat(result).isInstanceOf(NetworkResult.Success::class.java)
    }

    @Test
    fun `un retrait sans motif, sans session ou sans identifiant reste inerte`() = runTest {
        val removal = mockk<ContentRemovalClient>(relaxed = true)

        assertThat(repo(mockk(), removal).removeMessage("m1", null)).isNull()
        assertThat(repo(mockk(), removal).removePost("p1", "  ")).isNull()
        assertThat(repo(mockk(), removal, userId = null).removePost("p1", "spam")).isNull()
        assertThat(repo(mockk(), removal).removeComment("", "c1", "spam")).isNull()
        assertThat(repo(mockk(), removal).removeComment("p1", " ", "spam")).isNull()
        coVerify(exactly = 0) { removal.removeMessage(any(), any()) }
        coVerify(exactly = 0) { removal.removePost(any(), any()) }
        coVerify(exactly = 0) { removal.removeComment(any(), any(), any()) }
    }

    @Test
    fun `un refus du serveur remonte tel quel`() = runTest {
        val removal = mockk<ContentRemovalClient>()
        coEvery { removal.removeComment("p1", "c1", ContentRemovalRequest("spam")) } returns
            NetworkResult.Failure(ApiError(message = "no", code = "FORBIDDEN", httpStatus = 403))

        val result = repo(mockk(), removal).removeComment("p1", "c1", "spam")

        assertThat((result as NetworkResult.Failure).error.httpStatus).isEqualTo(403)
    }
}
