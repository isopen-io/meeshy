package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.group.GroupCallArrival
import org.junit.Test

class CallParticipantArrivalTest {

    @Test
    fun `a joined frame carries the nested joiner, its name and its media`() {
        val raw = """{"callId":"c1","participant":{"userId":"u2","username":"bob","displayName":"Bob",""" +
            """"avatar":"https://a/b.png","isAudioEnabled":false,"isVideoEnabled":true},"mode":"p2p","iceServers":[]}"""
        assertThat(CallSignalMapper.participantArrival(raw)).isEqualTo(
            CallParticipantArrival("c1", GroupCallArrival("u2", "Bob", "https://a/b.png", isAudioEnabled = false, isVideoEnabled = true)),
        )
    }

    @Test
    fun `the username names a joiner without display name`() {
        val raw = """{"callId":"c1","participant":{"userId":"u2","username":"bob","displayName":""}}"""
        assertThat(CallSignalMapper.participantArrival(raw)!!.arrival.displayName).isEqualTo("bob")
    }

    @Test
    fun `a joiner without id or a call without id is dropped`() {
        assertThat(CallSignalMapper.participantArrival("""{"callId":"c1","participant":{"username":"bob"}}""")).isNull()
        assertThat(CallSignalMapper.participantArrival("""{"callId":"","participant":{"userId":"u2"}}""")).isNull()
        assertThat(CallSignalMapper.participantArrival("nope")).isNull()
    }
}
