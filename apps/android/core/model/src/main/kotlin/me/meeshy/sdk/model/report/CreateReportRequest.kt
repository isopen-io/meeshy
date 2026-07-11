package me.meeshy.sdk.model.report

import kotlinx.serialization.Serializable

/**
 * The wire body for `POST /admin/reports` (any authenticated user may file a report; the gateway
 * fills `reporterId`/`reporterName` from the auth context, so the client omits them).
 *
 * Matches the gateway `createReportSchema`: `reportedType` ∈ {message,user,conversation,community},
 * `reportedEntityId` the reported entity id, `reportType` a lowercase reason token
 * ([ReportReason.wireValue]), and an optional free-text `reason`. Serialised with the SDK Json
 * (`explicitNulls = false`), a `null` [reason] is omitted from the body — matching the gateway's
 * optional field.
 */
@Serializable
public data class CreateReportRequest(
    val reportedType: String,
    val reportedEntityId: String,
    val reportType: String,
    val reason: String? = null,
)

/**
 * Ack payload of `POST /admin/reports`. The gateway returns the created report object; the client
 * only needs to know the call succeeded, so every field is optional and unknown keys are ignored.
 */
@Serializable
public data class ReportAck(
    val id: String? = null,
)

/**
 * Pure builder for report wire bodies — the single source of truth that turns UI intent
 * (`who` + [ReportReason] + free-text details) into a validated [CreateReportRequest].
 *
 * Keeping the projection pure (no I/O) lets the reason→token mapping, the id guard and the
 * details sanitisation all be branch-tested off the JVM, and keeps the repository a thin caller.
 */
public object ReportRequestBuilder {
    /** Max length of the optional free-text details — parity with the iOS 500-char editor cap. */
    public const val MAX_DETAILS_LENGTH: Int = 500

    /**
     * Builds a user-report body, or `null` when [userId] is blank (nothing to report — inert).
     * [details] is [sanitizeDetails]-normalised: trimmed, blank → `null` (a whitespace-only note
     * is a no-op, never an empty string on the wire), and capped at [MAX_DETAILS_LENGTH].
     */
    public fun forUser(userId: String, reason: ReportReason, details: String?): CreateReportRequest? {
        val id = userId.trim()
        if (id.isEmpty()) return null
        return CreateReportRequest(
            reportedType = "user",
            reportedEntityId = id,
            reportType = reason.wireValue,
            reason = sanitizeDetails(details),
        )
    }

    /** Trim → blank-to-`null` → cap at [MAX_DETAILS_LENGTH]. Exposed for the ViewModel's live cap. */
    public fun sanitizeDetails(details: String?): String? {
        val trimmed = details?.trim().orEmpty()
        if (trimmed.isEmpty()) return null
        return trimmed.take(MAX_DETAILS_LENGTH)
    }
}
