package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import org.junit.Test

class CaptureNoticeMetadataTest {

    private fun parse(raw: String) = CaptureNoticeMetadata.parse(Json.parseToJsonElement(raw) as JsonObject)

    private fun json(
        kind: String = "content-capture",
        actor: String = """{"participantId":"p1","displayName":"Alice","isAnonymous":false}""",
        id: String = "m1",
        nature: String = "after-read-flame",
        outcome: String = "announced",
        captureKind: String = "screenshot",
        sentAt: String = "2026-10-07T12:05:00Z",
    ) = """{"kind":"$kind","actor":$actor,"capturedMessageId":"$id","nature":"$nature","outcome":"$outcome",
        "captureKind":"$captureKind","sentAt":"$sentAt"}"""

    @Test
    fun `a well formed notice decodes`() {
        val notice = parse(json())!!
        assertThat(notice.nature).isEqualTo(ContentExitLaw.Nature.AFTER_READ_FLAME)
        assertThat(notice.outcome).isEqualTo(CaptureNoticeMetadata.Outcome.ANNOUNCED)
        assertThat(notice.sentAtEpochMillis).isEqualTo(1_791_374_700_000L)
    }

    @Test
    fun `an outcome that contradicts the nature is a false shape`() {
        assertThat(parse(json(nature = "view-once", outcome = "announced"))).isNull()
        assertThat(parse(json(nature = "timed-flame", outcome = "blocked"))).isNull()
        assertThat(parse(json(nature = "view-once", outcome = "blocked"))!!.outcome)
            .isEqualTo(CaptureNoticeMetadata.Outcome.BLOCKED)
    }

    @Test
    fun `an ordinary nature never has a notice`() {
        assertThat(parse(json(nature = "ordinary"))).isNull()
    }

    @Test
    fun `invalid metadata is rejected`() {
        assertThat(parse(json(kind = "call"))).isNull()
        assertThat(parse(json(id = ""))).isNull()
        assertThat(parse(json(captureKind = "photo"))).isNull()
        assertThat(parse(json(sentAt = "yesterday"))).isNull()
        assertThat(parse(json(actor = """{"participantId":"p1","displayName":"Alice"}"""))).isNull()
        assertThat(parse(json(actor = """{"participantId":"","displayName":"Alice","isAnonymous":false}"""))).isNull()
        assertThat(parse(json(actor = """{"participantId":"p","displayName":"A","isAnonymous":false,"username":3}"""))).isNull()
        assertThat(CaptureNoticeMetadata.parse(null)).isNull()
    }
}
