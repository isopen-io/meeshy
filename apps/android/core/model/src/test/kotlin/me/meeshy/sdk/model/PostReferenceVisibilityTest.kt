package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class PostReferenceVisibilityTest {
    @Test
    fun `seul SILENT est masque aux tiers`() {
        val table = mapOf(
            PostReferenceDisplay.INLINE to true,
            PostReferenceDisplay.PINNED to true,
            PostReferenceDisplay.NOTE to true,
            PostReferenceDisplay.SILENT to false,
        )
        table.forEach { (display, visible) -> assertThat(display.isPubliclyVisible).isEqualTo(visible) }
    }

    @Test
    fun `un mode inconnu se lit INLINE et un acces inconnu se lit none`() {
        assertThat(PostReferenceDisplay.fromWire("FUTURE")).isEqualTo(PostReferenceDisplay.INLINE)
        assertThat(ReferenceAccess.fromWire("future")).isEqualTo(ReferenceAccess.NONE)
    }

    @Test
    fun `le libelle prefere le nom d'affichage`() {
        assertThat(PostReference("u", "bob", displayName = "Bob B.").label).isEqualTo("Bob B.")
        assertThat(PostReference("u", "bob").label).isEqualTo("bob")
    }
}
