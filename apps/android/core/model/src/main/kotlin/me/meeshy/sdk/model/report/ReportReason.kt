package me.meeshy.sdk.model.report

/**
 * The reasons a user can be reported for — port of the iOS `ReportUserView.ReportReason`,
 * corrected to the gateway contract.
 *
 * Each case carries the **exact** `reportType` token the gateway `createReportSchema` accepts
 * (`z.enum(['spam', 'inappropriate', 'harassment', 'violence', 'hate_speech', 'fake_profile',
 * 'impersonation', 'other'])`). This is a deliberate correctness win over iOS, whose
 * `ReportReason.rawValue` is UPPERCASE (`"SPAM"`, `"HARASSMENT"`, `"INAPPROPRIATE_CONTENT"`, …) —
 * values the gateway zod enum rejects, so an iOS user report is silently a `400`. Android sends
 * the lowercase tokens the backend actually validates.
 *
 * [wireValue] is the single source of truth for the on-the-wire token; the UI renders a localized
 * label instead (never the token). [ordered] is the fixed presentation order (mirrors iOS).
 */
public enum class ReportReason(public val wireValue: String) {
    SPAM("spam"),
    HARASSMENT("harassment"),
    INAPPROPRIATE("inappropriate"),
    IMPERSONATION("impersonation"),
    OTHER("other"),
    ;

    public companion object {
        /** Fixed presentation order — parity with the iOS reason list. */
        public val ordered: List<ReportReason> = listOf(SPAM, HARASSMENT, INAPPROPRIATE, IMPERSONATION, OTHER)
    }
}
