package me.meeshy.sdk.model.comment

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CommentOutboxRulesTest {

    @Test
    fun `cmid_ et tmp_ sont des identifiants locaux`() {
        assertThat(CommentOutboxRules.isLocal("cmid_abc")).isTrue()
        assertThat(CommentOutboxRules.isLocal("tmp_abc")).isTrue()
        assertThat(CommentOutboxRules.isLocal("665f1c2e8b3a4d0012345678")).isFalse()
    }

    @Test
    fun `un media de plus de 24 h est re-televerse`() {
        val day = CommentOutboxRules.UPLOADED_MEDIA_WINDOW_MS
        assertThat(CommentOutboxRules.mustReupload(0L, day)).isFalse()
        assertThat(CommentOutboxRules.mustReupload(0L, day + 1)).isTrue()
    }

    @Test
    fun `repondre a une reponse se rattache a la racine`() {
        assertThat(CommentOutboxRules.threadRoot("reply", "root")).isEqualTo("root")
        assertThat(CommentOutboxRules.threadRoot("root", null)).isEqualTo("root")
        assertThat(CommentOutboxRules.threadRoot("root", " ")).isEqualTo("root")
    }

    @Test
    fun `la reprise ajoute le texte a l'existant`() {
        assertThat(CommentOutboxRules.resuming("perdu", into = "")).isEqualTo("perdu")
        assertThat(CommentOutboxRules.resuming("perdu", into = "deja")).isEqualTo("deja\nperdu")
    }

    @Test
    fun `la fusion place les non envoyes en tete sans doublon`() {
        val merged = CommentOutboxRules.merging(listOf("a", "b", "x"), into = listOf("x", "y")) { it }
        assertThat(merged).containsExactly("b", "a", "x", "y").inOrder()
    }
}
