package me.meeshy.sdk.post

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.PublicationModerationReceipt
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.ContentRemovalBody
import me.meeshy.sdk.net.api.PostApi
import org.junit.Test

class PostModerationRepositoryTest {

    private val api: PostApi = mockk()

    private fun failureCode(result: NetworkResult<Unit>) = (result as NetworkResult.Failure).error.code

    @Test
    fun `un motif trop court est refuse sans appel reseau`() = runTest {
        val result = PostModerationRepository(api).removePost("p1", " ab ")

        assertThat(failureCode(result)).isEqualTo(PostModerationRepository.INVALID_REASON)
        coVerify(exactly = 0) { api.deleteWithReason(any(), any()) }
    }

    @Test
    fun `un motif trop long est refuse sans appel reseau`() = runTest {
        val repository = PostModerationRepository(api)

        assertThat(failureCode(repository.removeComment("p1", "c1", "x".repeat(501))))
            .isEqualTo(PostModerationRepository.INVALID_REASON)
        assertThat(failureCode(repository.makePrivate("p1", "u1", "")))
            .isEqualTo(PostModerationRepository.INVALID_REASON)
        coVerify(exactly = 0) { api.deleteCommentWithReason(any(), any(), any()) }
        coVerify(exactly = 0) { api.moderatePublications(any(), any()) }
    }

    @Test
    fun `le retrait part avec le motif rogne`() = runTest {
        coEvery { api.deleteWithReason("p1", ContentRemovalBody("spam")) } returns ApiResponse(success = true)

        val result = PostModerationRepository(api).removePost("p1", "  spam ")

        assertThat(result).isEqualTo(NetworkResult.Success(Unit))
    }

    @Test
    fun `rendre prive n est accepte que si la passerelle l a applique`() = runTest {
        coEvery { api.moderatePublications("u1", any()) } returns ApiResponse(
            success = true,
            data = PublicationModerationReceipt("make-private", listOf(PublicationModerationReceipt.Result("p1", "outranked"))),
        )

        val result = PostModerationRepository(api).makePrivate("p1", "u1", "hors sujet")

        assertThat(failureCode(result)).isEqualTo(PostModerationRepository.NOT_APPLIED)
    }

    @Test
    fun `rendre prive reussit quand le recu dit updated`() = runTest {
        coEvery { api.moderatePublications("u1", any()) } returns ApiResponse(
            success = true,
            data = PublicationModerationReceipt("make-private", listOf(PublicationModerationReceipt.Result("p1", "updated"))),
        )

        assertThat(PostModerationRepository(api).makePrivate("p1", "u1", "hors sujet")).isEqualTo(NetworkResult.Success(Unit))
    }
}
