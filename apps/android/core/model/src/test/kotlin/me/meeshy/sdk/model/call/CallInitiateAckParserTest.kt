package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural spec for the pure `call:initiate` ACK parser. Mirrors the iOS
 * `emitCallInitiate` guard: a success needs `success:true` AND a non-blank
 * `data.callId`; every other body surfaces the gateway error message (from
 * `error.message`, a bare-string `error`, else `"unknown error"`); an
 * undecodable body is [CallInitiateResult.Malformed].
 *
 * Tested through the public `CallInitiateAckParser.parse(rawJson)` only —
 * given the ACK JSON string, assert the resulting [CallInitiateResult].
 */
class CallInitiateAckParserTest {

    private fun parse(json: String): CallInitiateResult = CallInitiateAckParser.parse(json)

    private fun success(json: String): CallInitiateAck =
        (parse(json) as CallInitiateResult.Success).ack

    // --- Success path -------------------------------------------------------

    @Test
    fun `a full ACK yields Success with callId mode iceServers and ttl`() {
        val ack = success(
            """
            {"success":true,"data":{
              "callId":"call-42","mode":"p2p","ttl":3600,
              "iceServers":[
                {"urls":"stun:stun.meeshy.me:3478"},
                {"urls":["turn:turn.meeshy.me:3478"],"username":"u","credential":"c"}
              ]
            }}
            """.trimIndent(),
        )
        assertThat(ack.callId).isEqualTo("call-42")
        assertThat(ack.mode).isEqualTo("p2p")
        assertThat(ack.ttlSeconds).isEqualTo(3600)
        assertThat(ack.iceServers).hasSize(2)
    }

    @Test
    fun `a single-string urls field becomes a one-element list`() {
        val ack = success("""{"success":true,"data":{"callId":"c1","iceServers":[{"urls":"stun:s:3478"}]}}""")
        assertThat(ack.iceServers.single().urls).containsExactly("stun:s:3478")
    }

    @Test
    fun `an array urls field keeps every entry`() {
        val ack = success(
            """{"success":true,"data":{"callId":"c1","iceServers":[{"urls":["turn:a:1","turn:b:2"]}]}}""",
        )
        assertThat(ack.iceServers.single().urls).containsExactly("turn:a:1", "turn:b:2").inOrder()
    }

    @Test
    fun `turn credentials are carried through`() {
        val ack = success(
            """{"success":true,"data":{"callId":"c1","iceServers":[{"urls":"turn:t:1","username":"alice","credential":"secret"}]}}""",
        )
        val server = ack.iceServers.single()
        assertThat(server.username).isEqualTo("alice")
        assertThat(server.credential).isEqualTo("secret")
    }

    @Test
    fun `a minimal ACK with only callId succeeds with empty iceServers and null mode ttl`() {
        val ack = success("""{"success":true,"data":{"callId":"c1"}}""")
        assertThat(ack.callId).isEqualTo("c1")
        assertThat(ack.iceServers).isEmpty()
        assertThat(ack.mode).isNull()
        assertThat(ack.ttlSeconds).isNull()
    }

    @Test
    fun `unknown extra fields are ignored`() {
        val ack = success("""{"success":true,"extra":1,"data":{"callId":"c1","surprise":"x"}}""")
        assertThat(ack.callId).isEqualTo("c1")
    }

    // --- ServerError path ---------------------------------------------------

    @Test
    fun `success false with an error object surfaces its message`() {
        val result = parse("""{"success":false,"error":{"code":"BUSY","message":"Line busy"}}""")
        assertThat(result).isEqualTo(CallInitiateResult.ServerError("Line busy"))
    }

    @Test
    fun `success false with a bare-string error surfaces the string`() {
        val result = parse("""{"success":false,"error":"CALL_ALREADY_ACTIVE"}""")
        assertThat(result).isEqualTo(CallInitiateResult.ServerError("CALL_ALREADY_ACTIVE"))
    }

    @Test
    fun `success false with an error object lacking a message falls back to unknown`() {
        val result = parse("""{"success":false,"error":{"code":"BUSY"}}""")
        assertThat(result).isEqualTo(CallInitiateResult.ServerError("unknown error"))
    }

    @Test
    fun `success false with no error field falls back to unknown`() {
        val result = parse("""{"success":false}""")
        assertThat(result).isEqualTo(CallInitiateResult.ServerError("unknown error"))
    }

    @Test
    fun `an absent success field is treated as failure`() {
        val result = parse("""{"data":{"callId":"c1"}}""")
        assertThat(result).isEqualTo(CallInitiateResult.ServerError("unknown error"))
    }

    @Test
    fun `success true but a missing callId is not a success`() {
        val result = parse("""{"success":true,"data":{"mode":"p2p"}}""")
        assertThat(result).isEqualTo(CallInitiateResult.ServerError("unknown error"))
    }

    @Test
    fun `success true but a blank callId is not a success`() {
        val result = parse("""{"success":true,"data":{"callId":"   "}}""")
        assertThat(result).isEqualTo(CallInitiateResult.ServerError("unknown error"))
    }

    @Test
    fun `success true but no data object is not a success`() {
        val result = parse("""{"success":true}""")
        assertThat(result).isEqualTo(CallInitiateResult.ServerError("unknown error"))
    }

    @Test
    fun `a non-string error value falls back to unknown`() {
        val result = parse("""{"success":false,"error":42}""")
        assertThat(result).isEqualTo(CallInitiateResult.ServerError("unknown error"))
    }

    // --- Robust urls handling -----------------------------------------------

    @Test
    fun `an urls field that is neither string nor array yields an empty url list`() {
        val ack = success("""{"success":true,"data":{"callId":"c1","iceServers":[{"urls":{}}]}}""")
        assertThat(ack.iceServers.single().urls).isEmpty()
    }

    @Test
    fun `non-string entries inside an urls array are dropped`() {
        val ack = success("""{"success":true,"data":{"callId":"c1","iceServers":[{"urls":["turn:a:1",{}]}]}}""")
        assertThat(ack.iceServers.single().urls).containsExactly("turn:a:1")
    }

    // --- Malformed path -----------------------------------------------------

    @Test
    fun `a body that is not valid JSON is Malformed`() {
        assertThat(parse("not json at all")).isEqualTo(CallInitiateResult.Malformed)
    }

    @Test
    fun `an iceServers field of the wrong shape is Malformed`() {
        assertThat(parse("""{"success":true,"data":{"callId":"c1","iceServers":5}}"""))
            .isEqualTo(CallInitiateResult.Malformed)
    }
}
