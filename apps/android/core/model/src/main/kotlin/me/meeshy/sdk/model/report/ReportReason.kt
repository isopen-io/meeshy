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
 * label instead (never the token). [ordered] is the user-report presentation order; [messageOrdered]
 * the (wider) message-report order — both mirror iOS.
 *
 * The enum is the union of the two report surfaces. [VIOLENCE] and [HATE_SPEECH] are message-only
 * reasons (parity with iOS `ReportMessageSheet.ReportType`): reporting a *person* for violence or
 * hate speech is a message-content judgement, so they stay out of the user-report [ordered] list.
 */
public enum class ReportReason(public val wireValue: String) {
    SPAM("spam"),
    HARASSMENT("harassment"),
    INAPPROPRIATE("inappropriate"),
    VIOLENCE("violence"),
    HATE_SPEECH("hate_speech"),
    IMPERSONATION("impersonation"),
    OTHER("other"),
    ;

    public companion object {
        /** Fixed presentation order for reporting a **user** — parity with the iOS `ReportUserView`. */
        public val ordered: List<ReportReason> = listOf(SPAM, HARASSMENT, INAPPROPRIATE, IMPERSONATION, OTHER)

        /**
         * Fixed presentation order for reporting a **message** — parity with the iOS
         * `ReportMessageSheet.ReportType.allCases`
         * (spam, inappropriate, harassment, violence, hate_speech, impersonation, other).
         */
        public val messageOrdered: List<ReportReason> =
            listOf(SPAM, INAPPROPRIATE, HARASSMENT, VIOLENCE, HATE_SPEECH, IMPERSONATION, OTHER)
    }
}
