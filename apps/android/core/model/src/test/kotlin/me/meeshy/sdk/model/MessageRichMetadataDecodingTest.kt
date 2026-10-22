package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

class MessageRichMetadataDecodingTest {

    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        explicitNulls = false
        coerceInputValues = true
    }

    private fun message(metadata: String): ApiMessage =
        json.decodeFromString("""{"id":"m1","conversationId":"c1","messageType":"system","content":"x","metadata":$metadata}""")

    @Test
    fun `a call summary decodes with type, outcome, duration, bytes and quality`() {
        val call = message(
            """{"kind":"call","callId":"call1","initiatorId":"u1","callType":"video","outcome":"completed",
               "durationSeconds":272,"bytesTotal":2400000,"bytesEstimated":true,"networkQuality":"good"}""",
        ).callSummary
        assertThat(call).isNotNull()
        assertThat(call!!.callType).isEqualTo(CallSummaryMetadata.MediaType.VIDEO)
        assertThat(call.outcome).isEqualTo(CallSummaryMetadata.Outcome.COMPLETED)
        assertThat(call.durationLabel).isEqualTo("04:32")
        assertThat(call.dataSpentLabel).isEqualTo("~2.4 MB")
        assertThat(call.networkQuality).isEqualTo(CallSummaryMetadata.NetworkQuality.GOOD)
        assertThat(call.isLive).isFalse()
        assertThat(call.isOutgoing("u1")).isTrue()
        assertThat(call.isOutgoing("u2")).isFalse()
    }

    @Test
    fun `a live call tolerates a missing outcome and a cancelled call is the initiator's view only`() {
        val live = message("""{"kind":"call-live","callId":"c","initiatorId":"u1","callType":"audio"}""").callSummary
        assertThat(live?.isLive).isTrue()
        val cancelled = message(
            """{"kind":"call","callId":"c","initiatorId":"u1","callType":"audio","outcome":"missed","endedByInitiator":true}""",
        ).callSummary!!
        assertThat(cancelled.isCancelled(viewerIsInitiator = true)).isTrue()
        assertThat(cancelled.isCancelled(viewerIsInitiator = false)).isFalse()
        assertThat(cancelled.bytesTotal).isNull()
        assertThat(cancelled.dataSpentLabel).isNull()
    }

    @Test
    fun `a terminal call without outcome is not a call summary`() {
        assertThat(message("""{"kind":"call","callId":"c","initiatorId":"u1","callType":"audio"}""").callSummary).isNull()
    }

    @Test
    fun `the call summary kind alias of the issue also decodes`() {
        val call = message(
            """{"kind":"call-summary","callId":"c","initiatorId":"u1","callType":"audio","outcome":"rejected"}""",
        ).callSummary
        assertThat(call?.outcome).isEqualTo(CallSummaryMetadata.Outcome.REJECTED)
    }

    @Test
    fun `data and duration formats follow the gateway`() {
        assertThat(CallSummaryMetadata.formatDuration(3725)).isEqualTo("1:02:05")
        assertThat(CallSummaryMetadata.formatDuration(-3)).isEqualTo("00:00")
        assertThat(CallSummaryMetadata.formatDataSize(400)).isEqualTo("1 KB")
        assertThat(CallSummaryMetadata.formatDataSize(999_700)).isEqualTo("1 MB")
    }

    @Test
    fun `a join notice decodes and a call is not mistaken for it`() {
        val notice = message(
            """{"kind":"member-joined","participantId":"p1","displayName":"Zoé","isAnonymous":true,"viaShareLink":true,
               "username":"ano_zz","linkRules":{"canSendMessages":true,"canSendFiles":false,"canSendImages":true}}""",
        )
        assertThat(notice.joinNotice?.displayName).isEqualTo("Zoé")
        assertThat(notice.joinNotice?.isAnonymous).isTrue()
        assertThat(notice.joinNotice?.linkRules?.canSendFiles).isFalse()
        assertThat(notice.callSummary).isNull()
        assertThat(notice.arrivalsNotice).isNull()
    }

    @Test
    fun `a join notice without flags never affirms a guest, and broken rules mean none`() {
        val notice = message(
            """{"kind":"member-joined","participantId":"p1","displayName":"Zoé","linkRules":{"canSendMessages":true}}""",
        ).joinNotice!!
        assertThat(notice.isAnonymous).isFalse()
        assertThat(notice.viaShareLink).isFalse()
        assertThat(notice.linkRules).isNull()
    }

    @Test
    fun `an arrivals line decodes, drops a broken arrival and never counts below its names`() {
        val line = message(
            """{"kind":"members-arrived","count":1,"windowStartedAt":"2026-01-01T00:00:00Z",
               "arrivals":[{"participantId":"p1","displayName":"Aïcha"},{"participantId":"","displayName":"x"},
                           {"participantId":"p2","displayName":"Tom"}]}""",
        ).arrivalsNotice!!
        assertThat(line.arrivals.map { it.displayName }).containsExactly("Aïcha", "Tom").inOrder()
        assertThat(line.count).isEqualTo(2)
    }

    @Test
    fun `an arrivals line without any readable arrival is not a notice`() {
        assertThat(
            message("""{"kind":"members-arrived","count":3,"windowStartedAt":"t","arrivals":[{"x":1}]}""").arrivalsNotice,
        ).isNull()
    }

    @Test
    fun `a sticker is read from the metadata and an empty one is an absence`() {
        assertThat(message("""{"sticker":{"emoji":"🔥"}}""").servedSticker?.emoji).isEqualTo("🔥")
        assertThat(message("""{"sticker":{}}""").servedSticker).isNull()
    }

    @Test
    fun `an unknown kind and unknown fields do not break the decoding`() {
        val m = message("""{"kind":"hologram-v9","shiny":{"deep":[1,2,3]}}""")
        assertThat(m.callSummary).isNull()
        assertThat(m.joinNotice).isNull()
        assertThat(m.arrivalsNotice).isNull()
        assertThat(m.metadata).isNotNull()
    }

    @Test
    fun `a hoisted location sits beside metadata without confusion`() {
        val m: ApiMessage = json.decodeFromString(
            """{"id":"m1","conversationId":"c1","location":{"latitude":1.5,"longitude":2.5,"name":"Café"},"metadata":{"location":{"latitude":9,"longitude":9}}}""",
        )
        assertThat(m.location?.name).isEqualTo("Café")
    }

    @Test
    fun `a pre-lot cache row without the new fields decodes`() {
        val m: ApiMessage = json.decodeFromString("""{"id":"m1","conversationId":"c1","content":"hi","messageType":"text"}""")
        assertThat(m.metadata).isNull()
        assertThat(m.callSummary).isNull()
        assertThat(m.consumedByMe).isNull()
        assertThat(m.isViewOnceOpenedByMe).isFalse()
    }
}
