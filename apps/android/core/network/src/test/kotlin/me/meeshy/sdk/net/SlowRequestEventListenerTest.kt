package me.meeshy.sdk.net

import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import okhttp3.Call
import okhttp3.Request
import org.junit.Test

class SlowRequestEventListenerTest {

    private val call = mockk<Call> {
        every { request() } returns Request.Builder().url("https://gate.meeshy.me/api/v1/conversations?token=secret").build()
    }

    private fun run(times: List<Long>, vararg events: String): List<String> {
        val logged = mutableListOf<String>()
        val queue = ArrayDeque(times)
        val listener = SlowRequestEventListener(sink = { logged += it }, clockMillis = { queue.removeFirst() })
        events.forEach {
            when (it) {
                "start" -> listener.callStart(call)
                "body" -> listener.responseBodyEnd(call, 10)
                "end" -> listener.callEnd(call)
            }
        }
        return logged
    }

    @Test
    fun `une requete de plus d'une seconde est journalisee avec la ventilation`() {
        val logged = run(listOf(0, 900, 1_300), "start", "body", "end")

        assertThat(logged).hasSize(1)
        assertThat(logged.single()).contains("Slow request GET /api/v1/conversations")
        assertThat(logged.single()).contains("1300ms (network 900ms, decoding 400ms)")
    }

    @Test
    fun `le journal ne contient ni la requete ni un secret`() {
        val logged = run(listOf(0, 900, 1_300), "start", "body", "end")
        assertThat(logged.single()).doesNotContain("secret")
        assertThat(logged.single()).doesNotContain("token")
    }

    @Test
    fun `une requete rapide n'est pas journalisee`() {
        assertThat(run(listOf(0, 100, 200), "start", "body", "end")).isEmpty()
    }
}
