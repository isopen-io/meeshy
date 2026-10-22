package me.meeshy.sdk.socket

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.call.CallControlRefusal
import me.meeshy.sdk.model.call.CallInviteOutcome
import me.meeshy.sdk.model.call.CallLiveFrameReply
import me.meeshy.sdk.model.call.CallLiveFrameTexts
import me.meeshy.sdk.model.call.CallReactionEmoji
import org.json.JSONObject
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class CallControlsSocketTest {
    private fun manager(fake: FakeCallSocket) = CallSocialSignalManager(fake.socket).also { it.attach() }

    @Test
    fun `invite emits callId and userId and is accepted on success`() = runTest {
        val fake = FakeCallSocket(ackReply = JSONObject("""{"success":true}"""))
        assertThat(manager(fake).inviteCallParticipant("c1", "u2").isSuccess).isTrue()
        val payload = fake.last("call:invite-participant")
        assertThat(payload.getString("callId")).isEqualTo("c1")
        assertThat(payload.getString("userId")).isEqualTo("u2")
    }

    @Test
    fun `mute emits targetUserId and a refusal arrives typed`() = runTest {
        val fake = FakeCallSocket(ackReply = JSONObject("""{"success":false,"code":"PERMISSION_DENIED"}"""))
        val result = manager(fake).muteCallParticipant("c1", "u2")
        val refusal = result.exceptionOrNull() as CallControlRefusal
        assertThat(refusal.reason).isEqualTo(CallControlRefusal.Reason.INSUFFICIENT_RIGHT)
        assertThat(fake.last("call:mute-participant").getString("targetUserId")).isEqualTo("u2")
    }

    @Test
    fun `reaction emits the glyph and a finished call is a typed refusal`() = runTest {
        val fake = FakeCallSocket(ackReply = JSONObject("""{"success":false,"code":"CALL_NOT_ACTIVE"}"""))
        val result = manager(fake).sendCallReaction("c1", CallReactionEmoji.FIRE)
        assertThat((result.exceptionOrNull() as CallControlRefusal).reason).isEqualTo(CallControlRefusal.Reason.CALL_ENDED)
        assertThat(fake.last("call:reaction").getString("emoji")).isEqualTo("🔥")
    }

    @Test
    fun `an ack without a success flag is malformed and an offline socket never emits`() = runTest {
        val malformed = manager(FakeCallSocket(ackReply = JSONObject("{}"))).inviteCallParticipant("c", "u")
        assertThat((malformed.exceptionOrNull() as CallControlRefusal).code).isEqualTo("MALFORMED_ACK")
        val offline = FakeCallSocket(connected = false)
        val result = manager(offline).sendCallReaction("c", CallReactionEmoji.CLAP)
        assertThat((result.exceptionOrNull() as CallControlRefusal).code).isEqualTo("NO_SOCKET")
        assertThat(offline.emitted).isEmpty()
    }

    @Test
    fun `a silent gateway times out`() = runTest {
        val result = manager(FakeCallSocket(ackSilent = true)).inviteCallParticipant("c", "u")
        assertThat((result.exceptionOrNull() as CallControlRefusal).code).isEqualTo("TIMEOUT")
    }

    @Test
    fun `incoming control events are exposed as hot flows keyed by callId`() = runTest {
        val fake = FakeCallSocket()
        val manager = manager(fake)
        manager.inviteSettled.test {
            fake.deliver("call:invite-declined", """{"callId":"c1","userId":"u"}""")
            fake.deliver("call:invite-expired", """{"callId":"c2","userId":"v"}""")
            assertThat(awaitItem().outcome).isEqualTo(CallInviteOutcome.DECLINED)
            assertThat(awaitItem().callId).isEqualTo("c2")
        }
        manager.reactionReceived.test {
            fake.deliver("call:reaction-received", """{"callId":"c1","userId":"u","emoji":"👏"}""")
            fake.deliver("call:reaction-received", """{"callId":"c1","userId":"u","emoji":"nope"}""")
            assertThat(awaitItem().emoji).isEqualTo(CallReactionEmoji.CLAP)
            expectNoEvents()
        }
        manager.mutedByModerator.test {
            fake.deliver("call:muted-by-moderator", """{"callId":"c1","byUserId":"m"}""")
            assertThat(awaitItem().byUserId).isEqualTo("m")
        }
        manager.participantInvited.test {
            fake.deliver("call:participant-invited", """{"callId":"c1","invitedBy":"a","invitee":{"userId":"u","username":"bob"},"participantCount":3}""")
            assertThat(awaitItem().invitee.username).isEqualTo("bob")
        }
    }

    @Test
    fun `malformed inbound frames do not crash`() {
        val fake = FakeCallSocket()
        manager(fake)
        fake.deliver("call:participant-invited", "{}")
        fake.deliver("call:muted-by-moderator", """{"callId":1}""")
    }

    @Test
    fun `frame select sends a null frame, trimmed texts and a reply`() = runTest {
        val fake = FakeCallSocket(ackReply = JSONObject("""{"success":true}"""))
        val manager = manager(fake)
        manager.selectCallLiveFrame("c1", null)
        val removal = fake.last("call:frame-select")
        assertThat(removal.has("frameId")).isTrue()
        assertThat(removal.isNull("frameId")).isTrue()
        assertThat(removal.has("texts")).isFalse()
        manager.selectCallLiveFrame("c1", "ambiance.aurore", CallLiveFrameTexts(name = "  Ana ", city = " "), CallLiveFrameReply.ACCEPTED)
        val payload = fake.last("call:frame-select")
        assertThat(payload.getString("reply")).isEqualTo("accepted")
        assertThat(payload.getJSONObject("texts").getString("name")).isEqualTo("Ana")
        assertThat(payload.getJSONObject("texts").has("city")).isFalse()
    }
}
