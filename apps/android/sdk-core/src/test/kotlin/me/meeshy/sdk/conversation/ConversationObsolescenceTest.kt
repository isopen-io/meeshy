package me.meeshy.sdk.conversation

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.ConversationObsoleted
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.ConversationObsoleteApi
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Test
import retrofit2.HttpException
import retrofit2.Response

/** « Rendre obsolète » (#14645) : la passerelle d'accord, la ligne et ses messages quittent l'appareil ; un refus ne touche à rien. */
class ConversationObsolescenceTest {

    private val served = ConversationObsoleted("c1", "2026-11-02T18:00:00.000Z", "2026-11-04T18:00:00.000Z")

    @Test
    fun `an agreed obsolescence removes the row and its messages from the device`() = runTest {
        val api = mockk<ConversationObsoleteApi>()
        coEvery { api.makeObsolete("c1") } returns ApiResponse(success = true, data = served)
        val removed = mutableListOf<String>()

        val result = ConversationObsolescence(api) { removed += it }.makeObsolete("c1")

        assertThat(result).isEqualTo(NetworkResult.Success(served))
        assertThat(removed).containsExactly("c1")
    }

    @Test
    fun `a refusal keeps the row and says why`() = runTest {
        val api = mockk<ConversationObsoleteApi>()
        val body = """{"success":false,"error":"The global conversation cannot be made obsolete"}"""
        coEvery { api.makeObsolete("meeshy") } throws HttpException(
            Response.error<Any>(403, body.toResponseBody("application/json".toMediaType())),
        )
        val removed = mutableListOf<String>()

        val result = ConversationObsolescence(api) { removed += it }.makeObsolete("meeshy")

        assertThat(result).isInstanceOf(NetworkResult.Failure::class.java)
        assertThat((result as NetworkResult.Failure).error.httpStatus).isEqualTo(403)
        assertThat(removed).isEmpty()
    }
}
