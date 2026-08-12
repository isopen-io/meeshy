package me.meeshy.sdk.call

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.call.ActiveCallMetadata
import me.meeshy.sdk.model.call.ActiveCallSession
import me.meeshy.sdk.net.api.ActiveCallApi
import org.junit.Test

/**
 * Probe semantics for [ActiveCallRepository] — the discovery behind the
 * « Rejoindre » affordance (parité rejoin iOS pill / web bulle call-live).
 * A probe NEVER breaks the surface that asks: any failure (network, 4xx,
 * success=false) degrades to « pas d'appel actif », jamais une exception.
 */
class ActiveCallRepositoryTest {

    private val api: ActiveCallApi = mockk()
    private val repository = ActiveCallRepository(api)

    private fun session(id: String = "call-1") = ActiveCallSession(
        id = id,
        conversationId = "conv-1",
        mode = "p2p",
        status = "active",
        metadata = ActiveCallMetadata(type = "video"),
    )

    @Test
    fun `returns the session when the gateway reports an active call`() = runTest {
        coEvery { api.activeCallForConversation("conv-1") } returns
            ApiResponse(success = true, data = session())

        val result = repository.activeCallFor("conv-1")

        assertThat(result?.id).isEqualTo("call-1")
        assertThat(result?.isVideo).isTrue()
    }

    @Test
    fun `returns null when no call is active (data null)`() = runTest {
        coEvery { api.activeCallForConversation("conv-1") } returns
            ApiResponse(success = true, data = null)

        assertThat(repository.activeCallFor("conv-1")).isNull()
    }

    @Test
    fun `returns null when the gateway rejects the probe (success false)`() = runTest {
        coEvery { api.activeCallForConversation("conv-1") } returns
            ApiResponse(success = false, data = session())

        assertThat(repository.activeCallFor("conv-1")).isNull()
    }

    @Test
    fun `returns null when the transport throws — a probe never crashes its surface`() = runTest {
        coEvery { api.activeCallForConversation("conv-1") } throws RuntimeException("offline")

        assertThat(repository.activeCallFor("conv-1")).isNull()
    }
}
