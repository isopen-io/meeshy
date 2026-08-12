package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural spec for the pure `call:join` ACK parser. A success needs
 * `success:true` and yields the (possibly empty) `data.iceServers`; a rejection,
 * a missing ACK, or an undecodable body is a [CallJoinResult.Failure] (the join
 * can't be trusted). Tested through the public `CallJoinAckParser.parse` only.
 */
class CallJoinAckParserTest {

    private fun parse(json: String?): CallJoinResult = CallJoinAckParser.parse(json)

    private fun success(json: String): CallJoinResult.Success =
        parse(json) as CallJoinResult.Success

    @Test
    fun `a join ACK with ice servers yields Success carrying them`() {
        val result = success(
            """
            {"success":true,"data":{
              "callSession":{"id":"call-42"},
              "iceServers":[
                {"urls":"stun:stun.l.google.com:19302"},
                {"urls":["turn:turn.meeshy.me:3478"],"username":"u","credential":"c"}
              ]
            }}
            """.trimIndent(),
        )

        assertThat(result.iceServers).hasSize(2)
        assertThat(result.iceServers[0].urls).containsExactly("stun:stun.l.google.com:19302")
        assertThat(result.iceServers[1].urls).containsExactly("turn:turn.meeshy.me:3478")
        assertThat(result.iceServers[1].username).isEqualTo("u")
        assertThat(result.iceServers[1].credential).isEqualTo("c")
    }

    @Test
    fun `a success ACK without ice servers yields Success with an empty list`() {
        val result = success("""{"success":true,"data":{"callSession":{"id":"c1"}}}""")

        assertThat(result.iceServers).isEmpty()
    }

    @Test
    fun `a rejected join surfaces the gateway error message`() {
        val result = parse("""{"success":false,"error":{"message":"Not in call room"}}""")

        assertThat(result).isInstanceOf(CallJoinResult.Failure::class.java)
        assertThat((result as CallJoinResult.Failure).message).isEqualTo("Not in call room")
    }

    @Test
    fun `a rejected join with a bare-string error surfaces it`() {
        val result = parse("""{"success":false,"error":"You are not a participant in this conversation"}""")

        assertThat((result as CallJoinResult.Failure).message)
            .isEqualTo("You are not a participant in this conversation")
    }

    @Test
    fun `a missing ACK is a Failure`() {
        val result = parse(null)

        assertThat(result).isInstanceOf(CallJoinResult.Failure::class.java)
        assertThat((result as CallJoinResult.Failure).message).isEqualTo(CallJoinAckParser.NO_ACK)
    }

    @Test
    fun `an undecodable body is a Failure`() {
        val result = parse("not json at all")

        assertThat(result).isInstanceOf(CallJoinResult.Failure::class.java)
    }
}
