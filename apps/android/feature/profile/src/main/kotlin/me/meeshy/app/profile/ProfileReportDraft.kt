package me.meeshy.app.profile

import me.meeshy.sdk.model.report.ReportReason

/** Ce que « Signaler » envoie : un motif, et « Bloquer aussi » si la personne ne l'est pas déjà. */
internal data class ProfileReportSubmission(val reason: ReportReason, val alsoBlock: Boolean)

/** Le brouillon du signalement en tuiles de choix (K47) : un motif d'abord, le blocage est une option. */
internal data class ProfileReportDraft(
    val reason: ReportReason? = null,
    val alsoBlock: Boolean = false,
) {
    val canSend: Boolean get() = reason != null

    /** Un seul motif : en choisir un autre remplace le premier, retoucher le courant ne le retire pas. */
    fun choose(next: ReportReason): ProfileReportDraft = copy(reason = next)

    fun toggleBlock(): ProfileReportDraft = copy(alsoBlock = !alsoBlock)

    fun submission(alreadyBlocked: Boolean = false): ProfileReportSubmission? =
        reason?.let { ProfileReportSubmission(it, alsoBlock = alsoBlock && offersBlock(alreadyBlocked)) }

    companion object {
        val reasons: List<ReportReason> = ReportReason.profileOrdered

        fun offersBlock(alreadyBlocked: Boolean): Boolean = !alreadyBlocked
    }
}
