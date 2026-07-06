package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural spec for the pure incoming-call push parser. Mirrors the iOS
 * `VoIPPushManager` guard: a push is a call iff `type ∈ {call, voip_call}` AND
 * it carries a non-blank `callId`; every other map is inert (`null`). `isVideo`
 * reads the string flag, and `iceServers` decodes the JSON-encoded array
 * leniently (missing / malformed → empty, never dropping the push).
 *
 * Tested through the public `IncomingCallPushParser.parse(map)` only.
 */
class IncomingCallPushParserTest {

    private fun parse(vararg pairs: Pair<String, String>): IncomingCallPush? =
        IncomingCallPushParser.parse(mapOf(*pairs))

    private fun call(vararg extra: Pair<String, String>): IncomingCallPush =
        parse("type" to "call", "callId" to "call-1", *extra)!!

    // --- Type gate ----------------------------------------------------------

    @Test
    fun `a data-only call push decodes to the typed shape`() {
        val push = parse(
            "type" to "call",
            "callId" to "call-42",
            "conversationId" to "conv-9",
            "callerUserId" to "user-7",
            "callerName" to "Ada",
            "isVideo" to "true",
        )!!
        assertThat(push.callId).isEqualTo("call-42")
        assertThat(push.conversationId).isEqualTo("conv-9")
        assertThat(push.callerUserId).isEqualTo("user-7")
        assertThat(push.callerName).isEqualTo("Ada")
        assertThat(push.isVideo).isTrue()
    }

    @Test
    fun `the recovery voip_call type is also accepted`() {
        assertThat(parse("type" to "voip_call", "callId" to "c1")).isNotNull()
    }

    @Test
    fun `a non-call type is inert`() {
        assertThat(parse("type" to "message", "callId" to "c1")).isNull()
    }

    @Test
    fun `a push with no type is inert`() {
        assertThat(parse("callId" to "c1")).isNull()
    }

    // --- callId requirement -------------------------------------------------

    @Test
    fun `a call push without a callId is inert`() {
        assertThat(parse("type" to "call")).isNull()
    }

    @Test
    fun `a call push with a blank callId is inert`() {
        assertThat(parse("type" to "call", "callId" to "   ")).isNull()
    }

    // --- isVideo flag -------------------------------------------------------

    @Test
    fun `isVideo false string is audio`() {
        assertThat(call("isVideo" to "false").isVideo).isFalse()
    }

    @Test
    fun `a missing isVideo defaults to audio`() {
        assertThat(call().isVideo).isFalse()
    }

    @Test
    fun `isVideo is parsed case-insensitively`() {
        assertThat(call("isVideo" to "TRUE").isVideo).isTrue()
    }

    @Test
    fun `a garbage isVideo value is treated as audio`() {
        assertThat(call("isVideo" to "yes").isVideo).isFalse()
    }

    // --- Optional identifiers blank-skip ------------------------------------

    @Test
    fun `blank optional identifiers become null`() {
        val push = call("conversationId" to "  ", "callerUserId" to "", "callerName" to " ")
        assertThat(push.conversationId).isNull()
        assertThat(push.callerUserId).isNull()
        assertThat(push.callerName).isNull()
    }

    @Test
    fun `absent optional identifiers are null`() {
        val push = call()
        assertThat(push.conversationId).isNull()
        assertThat(push.callerUserId).isNull()
        assertThat(push.callerName).isNull()
    }

    // --- displayName --------------------------------------------------------

    @Test
    fun `displayName uses the caller name when present`() {
        assertThat(call("callerName" to "Grace").displayName).isEqualTo("Grace")
    }

    @Test
    fun `displayName falls back to the shared placeholder when the name is absent`() {
        assertThat(call().displayName).isEqualTo(IncomingCallPush.UNKNOWN_CALLER)
    }

    // --- iceServers ---------------------------------------------------------

    @Test
    fun `iceServers decodes a JSON array of stun and turn servers`() {
        val push = call(
            "iceServers" to
                """[{"urls":"stun:stun.meeshy.me:3478"},""" +
                """{"urls":["turn:turn.meeshy.me:3478"],"username":"u","credential":"c"}]""",
        )
        assertThat(push.iceServers).hasSize(2)
        assertThat(push.iceServers[0].urls).containsExactly("stun:stun.meeshy.me:3478")
        assertThat(push.iceServers[1].urls).containsExactly("turn:turn.meeshy.me:3478")
        assertThat(push.iceServers[1].credential).isEqualTo("c")
    }

    @Test
    fun `an absent iceServers field yields an empty list`() {
        assertThat(call().iceServers).isEmpty()
    }

    @Test
    fun `a blank iceServers field yields an empty list`() {
        assertThat(call("iceServers" to "   ").iceServers).isEmpty()
    }

    @Test
    fun `a malformed iceServers string degrades to an empty list without dropping the push`() {
        val push = call("iceServers" to "{not-json")
        assertThat(push.callId).isEqualTo("call-1")
        assertThat(push.iceServers).isEmpty()
    }
}
