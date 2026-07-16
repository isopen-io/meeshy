package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.report.ReportReason
import me.meeshy.sdk.model.report.ReportRequestBuilder
import org.junit.Test

/**
 * [ReportMessageForm] is the pure state machine behind the report-a-message sheet: it holds the
 * chosen [ReportReason] + optional details and models the submit lifecycle as a single
 * [ReportSubmitStatus] enum (a cleaner SSOT than iOS's three separate `@State` booleans). All
 * branch logic — the details cap, the "editing clears a prior error" rule, and the submit-guard —
 * lives here so it is JVM-testable off any ViewModel/Compose plumbing.
 */
class ReportMessageFormTest {

    private fun form() = ReportMessageForm(messageId = "m1")

    @Test
    fun `a fresh form defaults to the message reason list with spam selected and is submittable`() {
        val f = form()
        assertThat(f.reasons).isEqualTo(ReportReason.messageOrdered)
        assertThat(f.selectedReason).isEqualTo(ReportReason.SPAM)
        assertThat(f.details).isEmpty()
        assertThat(f.detailsCount).isEqualTo(0)
        assertThat(f.status).isEqualTo(ReportSubmitStatus.Idle)
        assertThat(f.canSubmit).isTrue()
    }

    @Test
    fun `withReason selects the tapped reason`() {
        assertThat(form().withReason(ReportReason.HATE_SPEECH).selectedReason)
            .isEqualTo(ReportReason.HATE_SPEECH)
    }

    @Test
    fun `withDetails stores the note and tracks its length`() {
        val f = form().withDetails("abusive")
        assertThat(f.details).isEqualTo("abusive")
        assertThat(f.detailsCount).isEqualTo(7)
    }

    @Test
    fun `withDetails caps the note at the builder max length`() {
        val f = form().withDetails("x".repeat(ReportRequestBuilder.MAX_DETAILS_LENGTH + 50))
        assertThat(f.details).hasLength(ReportRequestBuilder.MAX_DETAILS_LENGTH)
    }

    @Test
    fun `withDetails keeps a note exactly at the boundary length`() {
        val exact = "y".repeat(ReportRequestBuilder.MAX_DETAILS_LENGTH)
        assertThat(form().withDetails(exact).details).hasLength(ReportRequestBuilder.MAX_DETAILS_LENGTH)
    }

    @Test
    fun `submitting blocks a second submit`() {
        val f = form().submitting()
        assertThat(f.isSubmitting).isTrue()
        assertThat(f.canSubmit).isFalse()
    }

    @Test
    fun `submitted latches and blocks resubmission`() {
        val f = form().submitting().submitted()
        assertThat(f.isSubmitted).isTrue()
        assertThat(f.canSubmit).isFalse()
    }

    @Test
    fun `failed surfaces an error and re-enables submit for a retry`() {
        val f = form().submitting().failed()
        assertThat(f.hasError).isTrue()
        assertThat(f.canSubmit).isTrue()
    }

    @Test
    fun `selecting a reason after an error clears the error back to idle`() {
        val f = form().submitting().failed().withReason(ReportReason.VIOLENCE)
        assertThat(f.hasError).isFalse()
        assertThat(f.status).isEqualTo(ReportSubmitStatus.Idle)
        assertThat(f.selectedReason).isEqualTo(ReportReason.VIOLENCE)
    }

    @Test
    fun `editing details after an error clears the error back to idle`() {
        val f = form().submitting().failed().withDetails("more context")
        assertThat(f.hasError).isFalse()
        assertThat(f.status).isEqualTo(ReportSubmitStatus.Idle)
    }

    @Test
    fun `editing while a submit is in flight never resets the submitting status`() {
        // A mid-flight edit must not silently re-enable the submit button and let a double fire.
        assertThat(form().submitting().withReason(ReportReason.OTHER).status)
            .isEqualTo(ReportSubmitStatus.Submitting)
        assertThat(form().submitting().withDetails("late note").status)
            .isEqualTo(ReportSubmitStatus.Submitting)
    }
}
