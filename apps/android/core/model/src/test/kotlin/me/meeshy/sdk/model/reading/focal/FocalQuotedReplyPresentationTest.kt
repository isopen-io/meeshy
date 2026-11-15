package me.meeshy.sdk.model.reading.focal

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class FocalQuotedReplyPresentationTest {
    @Test
    fun `la citation de la rangee plate offre deux lignes d'apercu et une ligne de titre`() {
        assertThat(FocalQuotedReplyPresentation.PREVIEW_LINE_LIMIT).isEqualTo(2)
        assertThat(FocalQuotedReplyPresentation.TITLE_LINE_LIMIT).isEqualTo(1)
    }

    @Test
    fun `le titre colle le nom a un deux-points precede d'une espace insecable`() {
        assertThat(FocalQuotedReplyPresentation.title("Alice")).isEqualTo("Alice :")
    }

    @Test
    fun `un nom vide ne produit pas de deux-points orphelin`() {
        assertThat(FocalQuotedReplyPresentation.title("")).isEmpty()
    }

    @Test
    fun `soi se cite par Vous, avant tout nom`() {
        assertThat(FocalQuotedReplyPresentation.author(isMe = true, name = "Alice", isMood = false))
            .isEqualTo(FocalQuotedReplyPresentation.Author.You)
    }

    @Test
    fun `un nom absent d'une humeur se cite par Humeur`() {
        assertThat(FocalQuotedReplyPresentation.author(isMe = false, name = null, isMood = true))
            .isEqualTo(FocalQuotedReplyPresentation.Author.Mood)
        assertThat(FocalQuotedReplyPresentation.author(isMe = false, name = "  ", isMood = true))
            .isEqualTo(FocalQuotedReplyPresentation.Author.Mood)
    }

    @Test
    fun `un nom servi gagne sur Humeur`() {
        assertThat(FocalQuotedReplyPresentation.author(isMe = false, name = "Bob", isMood = true))
            .isEqualTo(FocalQuotedReplyPresentation.Author.Named("Bob"))
    }

    @Test
    fun `sans nom ni humeur il ne reste aucun auteur a nommer`() {
        assertThat(FocalQuotedReplyPresentation.author(isMe = false, name = null, isMood = false))
            .isEqualTo(FocalQuotedReplyPresentation.Author.Anonymous)
    }

    @Test
    fun `le filet prend l'accent pour soi et la couleur de l'auteur sinon`() {
        assertThat(FocalQuotedReplyPresentation.railIsAccent(isMe = true)).isTrue()
        assertThat(FocalQuotedReplyPresentation.railIsAccent(isMe = false)).isFalse()
    }

    @Test
    fun `un apercu vide retombe sur le libelle du media`() {
        assertThat(FocalQuotedReplyPresentation.previewOrFallback("", "Médias")).isEqualTo("Médias")
        assertThat(FocalQuotedReplyPresentation.previewOrFallback("  ", "Médias")).isEqualTo("Médias")
        assertThat(FocalQuotedReplyPresentation.previewOrFallback("Salut", "Médias")).isEqualTo("Salut")
    }
}
