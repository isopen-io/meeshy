package me.meeshy.sdk.net

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.SerializationException
import me.meeshy.sdk.model.ContentFetchFailure
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Test
import retrofit2.HttpException
import retrofit2.Response
import java.io.IOException

class ContentFetchFailuresTest {

    private fun http(code: Int) = HttpException(Response.error<Any>(code, "{}".toResponseBody("application/json".toMediaType())))

    @Test
    fun `ApiError reseau devient NETWORK`() {
        assertThat(ApiError(message = "x", code = "NETWORK").toContentFetchFailure()).isEqualTo(ContentFetchFailure.NETWORK)
    }

    @Test
    fun `ApiError par statut HTTP`() {
        assertThat(ApiError("x", "HTTP_404", 404).toContentFetchFailure()).isEqualTo(ContentFetchFailure.NOT_FOUND)
        assertThat(ApiError("x", "HTTP_410", 410).toContentFetchFailure()).isEqualTo(ContentFetchFailure.NOT_FOUND)
        assertThat(ApiError("x", "HTTP_403", 403).toContentFetchFailure()).isEqualTo(ContentFetchFailure.FORBIDDEN)
        assertThat(ApiError("x", "HTTP_500", 500).toContentFetchFailure()).isEqualTo(ContentFetchFailure.SERVER)
    }

    @Test
    fun `corps illisible ou enveloppe refusee est serveur`() {
        assertThat(ApiError("x", "PARSE").toContentFetchFailure()).isEqualTo(ContentFetchFailure.SERVER)
        assertThat(ApiError("x").toContentFetchFailure()).isEqualTo(ContentFetchFailure.SERVER)
    }

    @Test
    fun `exceptions brutes`() {
        assertThat(IOException("down").toContentFetchFailure()).isEqualTo(ContentFetchFailure.NETWORK)
        assertThat(http(404).toContentFetchFailure()).isEqualTo(ContentFetchFailure.NOT_FOUND)
        assertThat(http(503).toContentFetchFailure()).isEqualTo(ContentFetchFailure.SERVER)
        assertThat(SerializationException("bad").toContentFetchFailure()).isEqualTo(ContentFetchFailure.SERVER)
    }
}
