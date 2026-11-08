package me.meeshy.sdk.model.fileviewer

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class DocumentPreviewPlanTest {

    @Test
    fun `un PDF s'apercoit par le moteur de pages`() {
        assertThat(DocumentPreviewPlan.of("application/pdf", "a.pdf")).isEqualTo(DocumentPreviewPlan.Pdf)
        assertThat(DocumentPreviewPlan.of(null, "a.PDF")).isEqualTo(DocumentPreviewPlan.Pdf)
    }

    @Test
    fun `une image raster passe par la vue web durcie`() {
        assertThat(DocumentPreviewPlan.of("image/png", "a.png")).isEqualTo(DocumentPreviewPlan.Web)
        assertThat(DocumentPreviewPlan.of("image/jpeg", "a")).isEqualTo(DocumentPreviewPlan.Web)
    }

    @Test
    fun `un contenu actif ne passe jamais par la vue web`() {
        assertThat(DocumentPreviewPlan.of("image/svg+xml", "a.svg")).isEqualTo(DocumentPreviewPlan.Unavailable)
        assertThat(DocumentPreviewPlan.of("text/html", "a.html")).isEqualTo(DocumentPreviewPlan.Unavailable)
        assertThat(DocumentPreviewPlan.of("image/png", "a.svg")).isEqualTo(DocumentPreviewPlan.Unavailable)
    }

    @Test
    fun `Office et le reste n'ont pas d'apercu`() {
        assertThat(DocumentPreviewPlan.of("application/msword", "a.doc")).isEqualTo(DocumentPreviewPlan.Unavailable)
        assertThat(DocumentPreviewPlan.of(null, null)).isEqualTo(DocumentPreviewPlan.Unavailable)
    }
}
