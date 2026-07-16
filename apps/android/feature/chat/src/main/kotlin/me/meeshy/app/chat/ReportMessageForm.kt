package me.meeshy.app.chat

import me.meeshy.sdk.model.report.ReportReason
import me.meeshy.sdk.model.report.ReportRequestBuilder

/** The submit lifecycle of the report-a-message sheet, as a single enum (no redundant booleans). */
enum class ReportSubmitStatus { Idle, Submitting, Submitted, Error }

/**
 * Immutable state of the report-a-message sheet — the message analogue of the profile module's
 * `ReportUserUiState`, upgraded to model the submit lifecycle with one [ReportSubmitStatus] enum
 * rather than three parallel booleans. Port of the iOS `ReportMessageSheet` `@State`.
 *
 * All decisions live in pure transitions ([withReason]/[withDetails]/[submitting]/[submitted]/
 * [failed]) so the ViewModel stays a thin caller and every branch is JVM-testable. The details cap
 * reuses the pure [ReportRequestBuilder] SSOT so the on-screen field and the wire body never
 * disagree. `null` [ReportMessageForm] in the chat state means the sheet is closed.
 */
data class ReportMessageForm(
    val messageId: String,
    val reasons: List<ReportReason> = ReportReason.messageOrdered,
    val selectedReason: ReportReason = ReportReason.SPAM,
    val details: String = "",
    val status: ReportSubmitStatus = ReportSubmitStatus.Idle,
) {
    /** Live character count for the details field (never exceeds the cap — enforced in [withDetails]). */
    val detailsCount: Int get() = details.length

    val isSubmitting: Boolean get() = status == ReportSubmitStatus.Submitting
    val isSubmitted: Boolean get() = status == ReportSubmitStatus.Submitted
    val hasError: Boolean get() = status == ReportSubmitStatus.Error

    /** Submit is live unless one is in flight or has already succeeded (an error still allows a retry). */
    val canSubmit: Boolean get() = status == ReportSubmitStatus.Idle || status == ReportSubmitStatus.Error

    fun withReason(reason: ReportReason): ReportMessageForm =
        copy(selectedReason = reason, status = clearedError())

    fun withDetails(value: String): ReportMessageForm =
        copy(details = value.take(ReportRequestBuilder.MAX_DETAILS_LENGTH), status = clearedError())

    fun submitting(): ReportMessageForm = copy(status = ReportSubmitStatus.Submitting)

    fun submitted(): ReportMessageForm = copy(status = ReportSubmitStatus.Submitted)

    fun failed(): ReportMessageForm = copy(status = ReportSubmitStatus.Error)

    /** Editing after a failed attempt clears the error; an in-flight/succeeded status is preserved. */
    private fun clearedError(): ReportSubmitStatus =
        if (status == ReportSubmitStatus.Error) ReportSubmitStatus.Idle else status
}
