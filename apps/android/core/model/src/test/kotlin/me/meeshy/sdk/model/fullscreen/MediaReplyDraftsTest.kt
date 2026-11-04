package me.meeshy.sdk.model.fullscreen

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class MediaReplyDraftsTest {

    @Test
    fun `une piece sans brouillon a un texte vide`() {
        assertThat(MediaReplyDrafts().draft("a1")).isEmpty()
    }

    @Test
    fun `chaque piece garde son propre brouillon`() {
        val drafts = MediaReplyDrafts().editing("a1", "premier").editing("a2", "second")

        assertThat(drafts.draft("a1")).isEqualTo("premier")
        assertThat(drafts.draft("a2")).isEqualTo("second")
    }

    @Test
    fun `ecrire ne modifie pas la valeur d'origine`() {
        val before = MediaReplyDrafts()

        before.editing("a1", "texte")

        assertThat(before.byPiece).isEmpty()
    }

    @Test
    fun `un texte vide retire la cle plutot que de la garder`() {
        val drafts = MediaReplyDrafts().editing("a1", "texte").editing("a1", "")

        assertThat(drafts.byPiece).isEmpty()
    }

    @Test
    fun `envoyer vide le brouillon de la seule piece envoyee`() {
        val drafts = MediaReplyDrafts().editing("a1", "un").editing("a2", "deux").sent("a1")

        assertThat(drafts.draft("a1")).isEmpty()
        assertThat(drafts.draft("a2")).isEqualTo("deux")
    }

    @Test
    fun `la saisie est gardee telle quelle, espaces compris`() {
        assertThat(MediaReplyDrafts().editing("a1", "salut ").draft("a1")).isEqualTo("salut ")
    }
}
