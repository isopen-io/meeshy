package me.meeshy.sdk.model.report

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ReportReasonPresentationTest {

    @Test
    fun `chaque motif a une icone et une cle de libelle propres`() {
        val all = ReportReason.entries.map(ReportReasonPresentation::of)
        assertThat(all.map { it.glyph }.toSet()).hasSize(ReportReason.entries.size)
        assertThat(all.map { it.labelKey }.toSet()).hasSize(ReportReason.entries.size)
    }

    @Test
    fun `les cinq motifs d'utilisateur portent l'icone iOS`() {
        val glyphs = ReportReasonPresentation.forUser.associate { it.reason to it.glyph }
        assertThat(glyphs).containsExactly(
            ReportReason.SPAM, ReportReasonGlyph.ENVELOPE,
            ReportReason.HARASSMENT, ReportReasonGlyph.RAISED_HAND,
            ReportReason.INAPPROPRIATE, ReportReasonGlyph.TRIANGLE,
            ReportReason.IMPERSONATION, ReportReasonGlyph.SILHOUETTE,
            ReportReason.OTHER, ReportReasonGlyph.ELLIPSE,
        ).inOrder()
    }

    @Test
    fun `l'ordre utilisateur et l'ordre message suivent les listes du modele`() {
        assertThat(ReportReasonPresentation.forUser.map { it.reason }).containsExactlyElementsIn(ReportReason.ordered).inOrder()
        assertThat(ReportReasonPresentation.forMessage.map { it.reason }).containsExactlyElementsIn(ReportReason.messageOrdered).inOrder()
    }

    @Test
    fun `les cles de libelle suivent le nom des chaines Android`() {
        assertThat(ReportReasonPresentation.of(ReportReason.INAPPROPRIATE).labelKey).isEqualTo("report_reason_inappropriate")
        assertThat(ReportReasonPresentation.of(ReportReason.HATE_SPEECH).labelKey).isEqualTo("report_reason_hate_speech")
    }

    @Test
    fun `les jetons envoyes sont les minuscules de la passerelle jamais les majuscules d'iOS`() {
        val iosTokens = setOf("SPAM", "HARASSMENT", "INAPPROPRIATE_CONTENT", "IMPERSONATION", "OTHER")
        ReportReasonPresentation.forUser.forEach {
            assertThat(it.reason.wireValue).isEqualTo(it.reason.wireValue.lowercase())
            assertThat(iosTokens).doesNotContain(it.reason.wireValue)
        }
    }
}
