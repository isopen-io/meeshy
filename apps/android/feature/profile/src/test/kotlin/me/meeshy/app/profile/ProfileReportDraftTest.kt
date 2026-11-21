package me.meeshy.app.profile

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.report.ReportReason
import org.junit.Test

/** Le brouillon du signalement en tuiles de choix : un motif d'abord, « Bloquer aussi » en option. */
class ProfileReportDraftTest {

    @Test
    fun `sans motif choisi Signaler n'est pas permis`() {
        val draft = ProfileReportDraft()
        assertThat(draft.canSend).isFalse()
        assertThat(draft.submission()).isNull()
    }

    @Test
    fun `choisir un motif permet d'envoyer ce motif et lui seul`() {
        val draft = ProfileReportDraft().choose(ReportReason.HARASSMENT)
        assertThat(draft.canSend).isTrue()
        assertThat(draft.submission()).isEqualTo(ProfileReportSubmission(ReportReason.HARASSMENT, alsoBlock = false))
    }

    @Test
    fun `choisir un autre motif remplace le premier et retoucher le meme ne le retire pas`() {
        val draft = ProfileReportDraft().choose(ReportReason.SPAM).choose(ReportReason.OTHER).choose(ReportReason.OTHER)
        assertThat(draft.reason).isEqualTo(ReportReason.OTHER)
    }

    @Test
    fun `bloquer aussi se bascule et part avec le signalement`() {
        val draft = ProfileReportDraft().choose(ReportReason.SPAM).toggleBlock()
        assertThat(draft.submission()).isEqualTo(ProfileReportSubmission(ReportReason.SPAM, alsoBlock = true))
        assertThat(draft.toggleBlock().submission()?.alsoBlock).isFalse()
    }

    @Test
    fun `bloquer aussi n'est pas offert a qui a deja bloque la personne`() {
        assertThat(ProfileReportDraft.offersBlock(alreadyBlocked = true)).isFalse()
        assertThat(ProfileReportDraft.offersBlock(alreadyBlocked = false)).isTrue()
    }

    @Test
    fun `une case bloquer aussi cochee puis un blocage deja acquis ne bloque pas deux fois`() {
        val draft = ProfileReportDraft().choose(ReportReason.SPAM).toggleBlock()
        assertThat(draft.submission(alreadyBlocked = true)?.alsoBlock).isFalse()
    }

    @Test
    fun `les motifs en tuiles gardent l'ordre de la fiche iOS`() {
        assertThat(ProfileReportDraft.reasons).isEqualTo(ReportReason.profileOrdered)
    }
}
