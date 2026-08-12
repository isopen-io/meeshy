package me.meeshy.sdk.outbox

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class OutboxPayloadGraftsTest {

    @Test
    fun `returns the first non-null result and stops`() {
        val calls = mutableListOf<String>()
        val a: OutboxPayloadGraft = { _, _, _ -> calls += "a"; null }
        val b: OutboxPayloadGraft = { _, _, _ -> calls += "b"; "from-b" }
        val c: OutboxPayloadGraft = { _, _, _ -> calls += "c"; "from-c" }

        val combined = OutboxPayloadGrafts.firstOf(a, b, c)
        val result = combined("payload", "placeholder", "real")

        assertThat(result).isEqualTo("from-b")
        assertThat(calls).containsExactly("a", "b").inOrder()
    }

    @Test
    fun `returns null when every graft declines`() {
        val a: OutboxPayloadGraft = { _, _, _ -> null }
        val b: OutboxPayloadGraft = { _, _, _ -> null }

        val result = OutboxPayloadGrafts.firstOf(a, b)("payload", "placeholder", "real")

        assertThat(result).isNull()
    }

    @Test
    fun `with no grafts declines everything`() {
        val result = OutboxPayloadGrafts.firstOf()("payload", "placeholder", "real")

        assertThat(result).isNull()
    }

    @Test
    fun `threads the same arguments to each graft`() {
        val seen = mutableListOf<Triple<String, String, String>>()
        val record: OutboxPayloadGraft = { payload, placeholder, realId ->
            seen += Triple(payload, placeholder, realId)
            null
        }

        OutboxPayloadGrafts.firstOf(record, record)("p", "ph", "r")

        assertThat(seen).containsExactly(Triple("p", "ph", "r"), Triple("p", "ph", "r"))
    }
}
