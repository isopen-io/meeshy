package me.meeshy.sdk.model.sticker

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StickerUsageLawTest {
    private fun e(glyph: String) = StickerUsageEntry.emoji(glyph)

    @Test
    fun `poser une decoration deja recente la remonte sans doublon`() {
        val next = StickerUsageLaw.recordUse(listOf(e("a"), e("b"), e("c")), e("c"))
        assertThat(next).containsExactly(e("c"), e("a"), e("b")).inOrder()
    }

    @Test
    fun `les recents sont bornes a cinquante, le plus ancien tombe`() {
        val full = (1..50).map { e("g$it") }
        val next = StickerUsageLaw.recordUse(full, e("new"))
        assertThat(next).hasSize(50)
        assertThat(next.first()).isEqualTo(e("new"))
        assertThat(next).doesNotContain(e("g50"))
    }

    @Test
    fun `epingler place en tete, desepingler retire`() {
        val pinned = StickerUsageLaw.toggleFavorite(listOf(e("a")), e("b"))
        assertThat(pinned).containsExactly(e("b"), e("a")).inOrder()
        assertThat(StickerUsageLaw.toggleFavorite(pinned, e("b"))).containsExactly(e("a"))
    }

    @Test
    fun `les favoris ne sont pas bornes`() {
        val many = (1..80).fold(emptyList<StickerUsageEntry>()) { acc, i -> StickerUsageLaw.toggleFavorite(acc, e("g$i")) }
        assertThat(many).hasSize(80)
    }

    @Test
    fun `la cle est propre au compte et globale sans compte`() {
        assertThat(StickerUsageLaw.key(StickerUsageLaw.RECENTS_BASE, "u1")).isEqualTo("meeshy.sticker.recents@u1")
        assertThat(StickerUsageLaw.key(StickerUsageLaw.RECENTS_BASE, null)).isEqualTo("meeshy.sticker.recents")
        assertThat(StickerUsageLaw.key(StickerUsageLaw.RECENTS_BASE, "")).isEqualTo("meeshy.sticker.recents")
    }

    @Test
    fun `la migration donne l'ancienne valeur au premier compte, jamais par dessus la sienne`() {
        assertThat(StickerUsageLaw.adoptedValue(scoped = null, legacy = "old")).isEqualTo("old")
        assertThat(StickerUsageLaw.adoptedValue(scoped = "mine", legacy = "old")).isEqualTo("mine")
        assertThat(StickerUsageLaw.adoptedValue(scoped = null, legacy = null)).isNull()
    }

    @Test
    fun `une entree orpheline disparait de l'affichage sans toucher la liste`() {
        val all = listOf(e("a"), StickerUsageEntry.template("gone"), e("b"))
        val shown = StickerUsageLaw.visible(all) { it.kind != StickerUsageEntry.Kind.TEMPLATE }
        assertThat(shown).containsExactly(e("a"), e("b")).inOrder()
        assertThat(all).hasSize(3)
    }

    @Test
    fun `le json est celui d'ios et s'aller-retour`() {
        val list = listOf(e("😀"), StickerUsageEntry.mee("bonjour"))
        val json = StickerUsageLaw.encode(list)
        assertThat(json).contains("\"kind\":\"emoji\"")
        assertThat(StickerUsageLaw.decode(json)).isEqualTo(list)
    }

    @Test
    fun `un genre inconnu ou un json casse ne vide pas la liste entiere`() {
        val stored = """[{"kind":"emoji","value":"a"},{"kind":"hologram","value":"x"},{"kind":"mee","value":"m"}]"""
        assertThat(StickerUsageLaw.decode(stored)).containsExactly(e("a"), StickerUsageEntry.mee("m")).inOrder()
        assertThat(StickerUsageLaw.decode("{not json")).isEmpty()
        assertThat(StickerUsageLaw.decode(null)).isEmpty()
    }
}
