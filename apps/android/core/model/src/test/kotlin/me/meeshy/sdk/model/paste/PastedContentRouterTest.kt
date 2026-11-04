package me.meeshy.sdk.model.paste

import com.google.common.truth.Truth.assertThat
import java.time.LocalDateTime
import org.junit.Test

class PastedContentRouterTest {
    private fun classify(vararg mimes: String) = PastedContentRouter.classify(mimes.toList())
    private fun text(n: Int) = PastedContent.Text("a".repeat(n))
    private fun decide(content: PastedContent, current: Int = 0, replaced: Int = 0) =
        PastedContentRouter.decide(content, current, replaced, limit = 2000)

    @Test
    fun `le texte brut gagne sur le média`() {
        assertThat(classify("image/png", "text/plain")).isEqualTo(PastedKind.Text)
    }

    @Test
    fun `une image seule est l'image`() {
        assertThat(classify("image/gif")).isEqualTo(PastedKind.Media(PastedPipeline.IMAGE))
    }

    @Test
    fun `vidéo et son ont leur famille`() {
        assertThat(classify("video/mp4")).isEqualTo(PastedKind.Media(PastedPipeline.VIDEO))
        assertThat(classify("audio/mpeg")).isEqualTo(PastedKind.Media(PastedPipeline.AUDIO))
    }

    @Test
    fun `un fichier copié est une pièce jamais un chemin`() {
        assertThat(classify("application/pdf")).isEqualTo(PastedKind.Media(PastedPipeline.FILE))
    }

    @Test
    fun `une adresse ou du html se colle comme du texte`() {
        assertThat(classify("text/uri-list")).isEqualTo(PastedKind.Text)
        assertThat(classify("text/html")).isEqualTo(PastedKind.Text)
    }

    @Test
    fun `sans type on colle du texte`() {
        assertThat(classify()).isEqualTo(PastedKind.Text)
    }

    @Test
    fun `le texte à la limite exacte s'insère`() {
        assertThat(decide(text(2000))).isEqualTo(PastedContentDecision.InsertText)
    }

    @Test
    fun `un caractère de plus part en pièce texte`() {
        assertThat(decide(text(2001))).isEqualTo(PastedContentDecision.AttachText)
    }

    @Test
    fun `la longueur du champ compte et la sélection remplacée se retranche`() {
        assertThat(decide(text(100), current = 1950)).isEqualTo(PastedContentDecision.AttachText)
        assertThat(decide(text(100), current = 1950, replaced = 50)).isEqualTo(PastedContentDecision.InsertText)
    }

    @Test
    fun `la mesure est en unités UTF-16`() {
        val emojis = PastedContent.Text("😀".repeat(1001))
        assertThat(decide(emojis)).isEqualTo(PastedContentDecision.AttachText)
        assertThat(decide(PastedContent.Text("😀".repeat(1000)))).isEqualTo(PastedContentDecision.InsertText)
    }

    @Test
    fun `un média devient toujours pièce`() {
        assertThat(decide(PastedContent.Media(PastedPipeline.VIDEO), current = 5000))
            .isEqualTo(PastedContentDecision.AttachMedia(PastedPipeline.VIDEO))
    }

    @Test
    fun `le nom du document est horodaté sans le contenu`() {
        assertThat(PastedContentRouter.fileName(LocalDateTime.of(2026, 3, 7, 9, 4, 5)))
            .isEqualTo("texte-colle-20260307-090405.txt")
    }
}
