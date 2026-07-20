package me.meeshy.sdk.model.report

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import org.junit.Test

/**
 * [ReportRequestBuilder.forUser] is the pure SSOT projecting UI intent into the gateway wire body.
 * It must fix the reported entity type/id, carry the correct lowercase reason token, sanitise the
 * optional details (trim, blank→null, 500-cap), and stay inert on a blank id.
 */
class ReportRequestBuilderTest {

    /** Mirrors the SDK Json: `explicitNulls = false` so a null `reason` is omitted from the body. */
    private val json = Json { explicitNulls = false }

    @Test
    fun `forUser builds a user report with the reason wire token`() {
        val request = ReportRequestBuilder.forUser("u1", ReportReason.HARASSMENT, "was rude")

        assertThat(request).isNotNull()
        assertThat(request!!.reportedType).isEqualTo("user")
        assertThat(request.reportedEntityId).isEqualTo("u1")
        assertThat(request.reportType).isEqualTo("harassment")
        assertThat(request.reason).isEqualTo("was rude")
    }

    @Test
    fun `forUser returns null on a blank id`() {
        assertThat(ReportRequestBuilder.forUser("", ReportReason.SPAM, "x")).isNull()
        assertThat(ReportRequestBuilder.forUser("   ", ReportReason.SPAM, "x")).isNull()
    }

    @Test
    fun `forUser trims the surrounding whitespace off the id`() {
        val request = ReportRequestBuilder.forUser("  u1  ", ReportReason.SPAM, null)
        assertThat(request!!.reportedEntityId).isEqualTo("u1")
    }

    @Test
    fun `forUser drops empty details to null`() {
        assertThat(ReportRequestBuilder.forUser("u1", ReportReason.OTHER, null)!!.reason).isNull()
        assertThat(ReportRequestBuilder.forUser("u1", ReportReason.OTHER, "")!!.reason).isNull()
        assertThat(ReportRequestBuilder.forUser("u1", ReportReason.OTHER, "   ")!!.reason).isNull()
    }

    @Test
    fun `forUser trims details before sending`() {
        assertThat(ReportRequestBuilder.forUser("u1", ReportReason.SPAM, "  hi  ")!!.reason).isEqualTo("hi")
    }

    @Test
    fun `forUser caps over-long details at the max length`() {
        val long = "a".repeat(ReportRequestBuilder.MAX_DETAILS_LENGTH + 120)
        val reason = ReportRequestBuilder.forUser("u1", ReportReason.SPAM, long)!!.reason
        assertThat(reason).hasLength(ReportRequestBuilder.MAX_DETAILS_LENGTH)
    }

    @Test
    fun `forUser keeps details exactly at the boundary length`() {
        val exact = "b".repeat(ReportRequestBuilder.MAX_DETAILS_LENGTH)
        assertThat(ReportRequestBuilder.forUser("u1", ReportReason.SPAM, exact)!!.reason).hasLength(ReportRequestBuilder.MAX_DETAILS_LENGTH)
    }

    @Test
    fun `a null reason is omitted from the serialized body`() {
        val request = ReportRequestBuilder.forUser("u1", ReportReason.SPAM, null)!!
        val encoded = json.encodeToString(CreateReportRequest.serializer(), request).let(json::parseToJsonElement).jsonObject
        assertThat(encoded.keys).containsExactly("reportedType", "reportedEntityId", "reportType")
        assertThat(encoded.keys).doesNotContain("reason")
    }

    @Test
    fun `forMessage builds a message report with the reason wire token`() {
        val request = ReportRequestBuilder.forMessage("m1", ReportReason.HATE_SPEECH, "  slur  ")

        assertThat(request).isNotNull()
        assertThat(request!!.reportedType).isEqualTo("message")
        assertThat(request.reportedEntityId).isEqualTo("m1")
        assertThat(request.reportType).isEqualTo("hate_speech")
        assertThat(request.reason).isEqualTo("slur")
    }

    @Test
    fun `forMessage returns null on a blank id`() {
        assertThat(ReportRequestBuilder.forMessage("", ReportReason.SPAM, "x")).isNull()
        assertThat(ReportRequestBuilder.forMessage("   ", ReportReason.SPAM, "x")).isNull()
    }

    @Test
    fun `forMessage trims the surrounding whitespace off the id`() {
        assertThat(ReportRequestBuilder.forMessage("  m1  ", ReportReason.VIOLENCE, null)!!.reportedEntityId)
            .isEqualTo("m1")
    }

    @Test
    fun `forMessage drops blank details to null and caps over-long ones`() {
        assertThat(ReportRequestBuilder.forMessage("m1", ReportReason.OTHER, "   ")!!.reason).isNull()
        val long = "z".repeat(ReportRequestBuilder.MAX_DETAILS_LENGTH + 40)
        assertThat(ReportRequestBuilder.forMessage("m1", ReportReason.OTHER, long)!!.reason)
            .hasLength(ReportRequestBuilder.MAX_DETAILS_LENGTH)
    }

    @Test
    fun `sanitizeDetails caps a whitespace-padded over-long note after trimming`() {
        // Leading/trailing spaces are trimmed first, THEN the 500-cap applies to the core text.
        val padded = "   " + "c".repeat(ReportRequestBuilder.MAX_DETAILS_LENGTH + 10) + "   "
        assertThat(ReportRequestBuilder.sanitizeDetails(padded)).hasLength(ReportRequestBuilder.MAX_DETAILS_LENGTH)
    }
}
