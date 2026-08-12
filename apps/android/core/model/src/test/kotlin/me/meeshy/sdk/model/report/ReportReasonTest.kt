package me.meeshy.sdk.model.report

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * [ReportReason] is the source of truth for the gateway `reportType` token. The gateway
 * `createReportSchema` accepts a fixed lowercase enum; every reason's [ReportReason.wireValue]
 * must be one of those tokens (the bug Android fixes vs iOS's uppercase raw values), and the
 * presentation order must be stable.
 */
class ReportReasonTest {

    /** The subset of the gateway `reportType` enum the client exposes. */
    private val gatewayReportTypeEnum = setOf(
        "spam", "inappropriate", "harassment", "violence",
        "hate_speech", "fake_profile", "impersonation", "other",
    )

    @Test
    fun `every wire value is a valid gateway report type token`() {
        ReportReason.entries.forEach { reason ->
            assertThat(gatewayReportTypeEnum).contains(reason.wireValue)
        }
    }

    @Test
    fun `wire values map to the expected lowercase tokens`() {
        assertThat(ReportReason.SPAM.wireValue).isEqualTo("spam")
        assertThat(ReportReason.HARASSMENT.wireValue).isEqualTo("harassment")
        assertThat(ReportReason.INAPPROPRIATE.wireValue).isEqualTo("inappropriate")
        assertThat(ReportReason.IMPERSONATION.wireValue).isEqualTo("impersonation")
        assertThat(ReportReason.OTHER.wireValue).isEqualTo("other")
    }

    @Test
    fun `the message-only reasons carry their gateway tokens`() {
        assertThat(ReportReason.VIOLENCE.wireValue).isEqualTo("violence")
        assertThat(ReportReason.HATE_SPEECH.wireValue).isEqualTo("hate_speech")
    }

    @Test
    fun `wire values are lowercase - the iOS uppercase bug is not reintroduced`() {
        ReportReason.entries.forEach { reason ->
            assertThat(reason.wireValue).isEqualTo(reason.wireValue.lowercase())
        }
    }

    @Test
    fun `ordered lists every reason once in the fixed presentation order`() {
        assertThat(ReportReason.ordered).containsExactly(
            ReportReason.SPAM,
            ReportReason.HARASSMENT,
            ReportReason.INAPPROPRIATE,
            ReportReason.IMPERSONATION,
            ReportReason.OTHER,
        ).inOrder()
    }

    @Test
    fun `ordered stays the user subset - it never grows the message-only reasons`() {
        // The user-report list is deliberately narrower than the message list: reporting a
        // person for "violence"/"hate_speech" is a message-content judgement, not an identity one.
        assertThat(ReportReason.ordered).containsNoneOf(ReportReason.VIOLENCE, ReportReason.HATE_SPEECH)
    }

    @Test
    fun `messageOrdered mirrors the iOS ReportType order`() {
        // Parity with iOS `ReportMessageSheet.ReportType.allCases`:
        // spam, inappropriate, harassment, violence, hate_speech, impersonation, other.
        assertThat(ReportReason.messageOrdered).containsExactly(
            ReportReason.SPAM,
            ReportReason.INAPPROPRIATE,
            ReportReason.HARASSMENT,
            ReportReason.VIOLENCE,
            ReportReason.HATE_SPEECH,
            ReportReason.IMPERSONATION,
            ReportReason.OTHER,
        ).inOrder()
    }

    @Test
    fun `messageOrdered covers the full enum with no omissions`() {
        assertThat(ReportReason.messageOrdered).containsExactlyElementsIn(ReportReason.entries)
    }

    @Test
    fun `wire values are distinct`() {
        val values = ReportReason.entries.map { it.wireValue }
        assertThat(values).containsNoDuplicates()
    }
}
