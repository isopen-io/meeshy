package me.meeshy.sdk.outbox.senders

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.net.api.PreferencesApi
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.SendResult
import me.meeshy.sdk.preferences.PreferencesSyncCoordinator
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Test
import retrofit2.HttpException
import retrofit2.Response

class UpdatePreferenceCategoryHandlerTest {

    private val coordinator = mockk<PreferencesSyncCoordinator>(relaxed = true)

    private fun row(category: String = "video") =
        outboxRow(OutboxKind.UPDATE_PREFERENCE_CATEGORY, targetId = category, payload = """{"mirrorLocalVideo":false}""")

    private fun handler(api: PreferencesApi) = UpdatePreferenceCategoryHandler(api, senderJson) { coordinator }

    @Test
    fun `the snapshot is patched on the route named by the target`() = runTest {
        val api = mockk<PreferencesApi>()
        coEvery { api.patchBlock(any(), any()) } returns ApiResponse(success = true, data = Unit)

        val result = handler(api).send(row("document"))

        assertThat(result).isEqualTo(SendResult.Success)
        coVerify { api.patchBlock("document", JsonObject(mapOf("mirrorLocalVideo" to JsonPrimitive(false)))) }
    }

    @Test
    fun `a refusal by validation is permanent, a rate limit or server error is retried`() = runTest {
        val api = mockk<PreferencesApi>()
        coEvery { api.patchBlock(any(), any()) } throws HttpException(Response.error<Unit>(400, "{}".toResponseBody()))
        assertThat(handler(api).send(row())).isInstanceOf(SendResult.PermanentFailure::class.java)

        listOf(401, 408, 429, 503).forEach { status ->
            coEvery { api.patchBlock(any(), any()) } throws HttpException(Response.error<Unit>(status, "{}".toResponseBody()))
            assertThat(handler(api).send(row())).isEqualTo(SendResult.TransientFailure)
        }
    }

    @Test
    fun `an unknown category is a permanent failure that never reaches the network`() = runTest {
        val api = mockk<PreferencesApi>()

        val result = handler(api).send(row("hologram"))

        assertThat(result).isInstanceOf(SendResult.PermanentFailure::class.java)
        coVerify(exactly = 0) { api.patchBlock(any(), any()) }
    }

    @Test
    fun `an exhausted write re-reads the named category`() = runTest {
        handler(mockk()).onExhausted(row("message"))

        coVerify { coordinator.refreshCategory("message") }
    }
}
