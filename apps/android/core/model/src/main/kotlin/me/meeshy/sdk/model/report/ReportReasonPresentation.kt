package me.meeshy.sdk.model.report

/** Pictogramme d'un motif, sans dépendance d'UI : la couche Compose le projette sur un vecteur. */
public enum class ReportReasonGlyph { ENVELOPE, RAISED_HAND, TRIANGLE, SILHOUETTE, ELLIPSE, BOLT, SPEECH_BUBBLE }

/** Présentation d'un motif : icône dédiée et nom de la chaîne Android de son libellé. Jamais le jeton réseau. */
public data class ReportReasonPresentation(
    val reason: ReportReason,
    val glyph: ReportReasonGlyph,
    val labelKey: String,
) {
    public companion object {
        public fun of(reason: ReportReason): ReportReasonPresentation = when (reason) {
            ReportReason.SPAM -> ReportReasonPresentation(reason, ReportReasonGlyph.ENVELOPE, "report_reason_spam")
            ReportReason.HARASSMENT -> ReportReasonPresentation(reason, ReportReasonGlyph.RAISED_HAND, "report_reason_harassment")
            ReportReason.INAPPROPRIATE -> ReportReasonPresentation(reason, ReportReasonGlyph.TRIANGLE, "report_reason_inappropriate")
            ReportReason.IMPERSONATION -> ReportReasonPresentation(reason, ReportReasonGlyph.SILHOUETTE, "report_reason_impersonation")
            ReportReason.OTHER -> ReportReasonPresentation(reason, ReportReasonGlyph.ELLIPSE, "report_reason_other")
            ReportReason.VIOLENCE -> ReportReasonPresentation(reason, ReportReasonGlyph.BOLT, "report_reason_violence")
            ReportReason.HATE_SPEECH -> ReportReasonPresentation(reason, ReportReasonGlyph.SPEECH_BUBBLE, "report_reason_hate_speech")
        }

        public val forUser: List<ReportReasonPresentation> = ReportReason.ordered.map(::of)
        public val forMessage: List<ReportReasonPresentation> = ReportReason.messageOrdered.map(::of)
    }
}
