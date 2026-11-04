package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CommentSheetRulesTest {
    private fun comment(id: String) = ApiPostComment(id = id, content = id)

    @Test
    fun `la fusion garde en tete la ligne optimiste que le serveur ne connait pas`() {
        val merged = CommentSheetRules.mergeFetched(
            current = listOf(comment("tmp_1"), comment("a")),
            fetched = listOf(comment("a"), comment("b")),
        )
        assertThat(merged.map { it.id }).containsExactly("tmp_1", "a", "b").inOrder()
    }

    @Test
    fun `la fusion garde un echo socket arrive pendant le GET`() {
        val merged = CommentSheetRules.mergeFetched(
            current = listOf(comment("echo"), comment("a")),
            fetched = listOf(comment("a")),
        )
        assertThat(merged.map { it.id }).containsExactly("echo", "a").inOrder()
    }

    @Test
    fun `une ligne tmp_ ou cmid_ n est jamais persistable`() {
        val kept = CommentSheetRules.persistable(listOf(comment("tmp_1"), comment("cmid_2"), comment("real")))
        assertThat(kept.map { it.id }).containsExactly("real")
    }

    @Test
    fun `le disque est plafonne a 500 lignes`() {
        val many = (1..600).map { comment("c$it") }
        assertThat(CommentSheetRules.persistable(many)).hasSize(500)
    }

    @Test
    fun `la charge complete est requise quand le total depasse les trois embarques`() {
        assertThat(CommentSheetRules.needsFullLoad(embeddedCount = 3, serverTotal = 12)).isTrue()
        assertThat(CommentSheetRules.needsFullLoad(embeddedCount = 3, serverTotal = 3)).isFalse()
        assertThat(CommentSheetRules.needsFullLoad(embeddedCount = 3, serverTotal = null)).isFalse()
    }

    @Test
    fun `une traduction se pose quand sa langue est preferee et l origine moins prioritaire`() {
        assertThat(CommentSheetRules.shouldApplyTranslation("fr", "en", listOf("fr", "en"))).isTrue()
    }

    @Test
    fun `une traduction vers un rang inferieur se pose si l origine n occupe aucun rang`() {
        assertThat(CommentSheetRules.shouldApplyTranslation("en", "de", listOf("fr", "en"))).isTrue()
    }

    @Test
    fun `une traduction ne se pose pas quand l origine occupe un rang plus prioritaire`() {
        assertThat(CommentSheetRules.shouldApplyTranslation("en", "fr", listOf("fr", "en"))).isFalse()
    }

    @Test
    fun `une traduction ne se pose pas quand sa langue n est pas preferee`() {
        assertThat(CommentSheetRules.shouldApplyTranslation("es", "en", listOf("fr", "en"))).isFalse()
    }
}
