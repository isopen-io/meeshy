package me.meeshy.sdk.net

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.ApiResponseMeta
import me.meeshy.sdk.model.Pagination
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Test
import retrofit2.Response

class ApiMetaAndDeletionCallTest {
    private val meta = ApiResponseMeta(deletedStoryIds = listOf("s"))
    private val json = "application/json".toMediaTypeOrNull()

    @Test
    fun `pagedApiCall expose meta et ancre du curseur`() = runTest {
        val r = pagedApiCall {
            ApiResponse(success = true, data = "d", pagination = Pagination(hasMore = true, nextCursor = "c"), meta = meta)
        } as NetworkResult.Success
        assertThat(r.data.meta).isEqualTo(meta)
        assertThat(r.data.nextCursor).isEqualTo("c")
    }

    @Test
    fun `conditionalApiCall Fresh porte meta et ETag`() = runTest {
        val fresh = conditionalApiCall {
            Response.success(
                ApiResponse(success = true, data = "d", meta = meta),
                okhttp3.Headers.headersOf("ETag", "\"v1\""),
            )
        } as ConditionalResult.Fresh
        assertThat(fresh.meta).isEqualTo(meta)
        assertThat(fresh.etag).isEqualTo("\"v1\"")
    }

    @Test
    fun `tout 2xx confirme une suppression, corps vide compris`() = runTest {
        listOf("""{"message":"x"}""", """{"data":{"deleted":true}}""", "").forEach { body ->
            val r = deletionCall { Response.success(200, body.toResponseBody(json)) }
            assertThat(r).isInstanceOf(NetworkResult.Success::class.java)
        }
        assertThat(deletionCall { Response.success(204, "".toResponseBody(json)) })
            .isInstanceOf(NetworkResult.Success::class.java)
    }

    @Test
    fun `un 4xx ou 5xx reste un Failure`() = runTest {
        val f = deletionCall { Response.error(403, """{"success":false,"error":"no","code":"FORBIDDEN"}""".toResponseBody(json)) }
            as NetworkResult.Failure
        assertThat(f.error.code).isEqualTo("FORBIDDEN")
        assertThat(f.error.httpStatus).isEqualTo(403)
        assertThat(deletionCall { Response.error(500, "".toResponseBody(json)) })
            .isInstanceOf(NetworkResult.Failure::class.java)
    }
}
