package me.meeshy.sdk.model.sticker

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class MeeStickerPickerStateTest {
    @Test
    fun `l'onglet par défaut est Mee`() {
        assertThat(MeeStickerPickerState().tab).isEqualTo(MeeStickerTab.MEE)
    }

    @Test
    fun `les onglets mee, meo et duo montrent leur distribution par intention`() {
        MeeStickerTab.entries.forEach { tab ->
            val rows = MeeStickerPickerState().select(tab).rows
            val stickers = rows.filterIsInstance<MeeStickerRow.Stickers>().flatMap { it.stickers }
            assertThat(stickers).isNotEmpty()
            assertThat(stickers.all { it.character == tab.cast }).isTrue()
            assertThat(rows.first()).isInstanceOf(MeeStickerRow.Title::class.java)
        }
    }

    @Test
    fun `une recherche sans réponse est un état vide explicite`() {
        val state = MeeStickerPickerState().search("zzzzzz-introuvable")
        assertThat(state.searchIsEmpty).isTrue()
        assertThat(state.rows).isEmpty()
    }

    @Test
    fun `une recherche vide n'est pas un état vide`() {
        val state = MeeStickerPickerState().search("   ")
        assertThat(state.searching).isFalse()
        assertThat(state.searchIsEmpty).isFalse()
        assertThat(state.rows).isNotEmpty()
    }

    @Test
    fun `une recherche trouve par titre`() {
        val sticker = MeeStickerCatalog.all.first()
        val state = MeeStickerPickerState().search(sticker.title)
        assertThat(state.results).contains(sticker)
        assertThat(state.rows.none { it is MeeStickerRow.Title }).isTrue()
    }

    @Test
    fun `chaque sticker a un titre d'accessibilité non vide`() {
        assertThat(MeeStickerCatalog.all.all { MeeStickerPickerState.accessibilityTitle(it).isNotBlank() }).isTrue()
    }
}
