package me.meeshy.sdk.model.sticker

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StickerSheetChoiceCustomTest {

    @Test
    fun `un pack integre se lit comme sa distribution`() {
        assertThat(MeeStickerCatalog.cast(forPackSlug = "mee")).isEqualTo(MeeCharacter.MEE)
        assertThat(MeeStickerCatalog.cast(forPackSlug = "meo")).isEqualTo(MeeCharacter.MEO)
        assertThat(MeeStickerCatalog.cast(forPackSlug = "mee-et-meo")).isEqualTo(MeeCharacter.DUO)
        assertThat(MeeStickerCatalog.cast(forPackSlug = "ecole")).isNull()
    }

    @Test
    fun `un pack integre a un nom avant que la passerelle reponde`() {
        assertThat(MeeStickerCatalog.builtinPackTitle("mee-et-meo")).isEqualTo("Mee & Meo")
        assertThat(MeeStickerCatalog.builtinPackTitle("meo")).isEqualTo("Meo")
        assertThat(MeeStickerCatalog.builtinPackTitle("ecole")).isNull()
    }

    @Test
    fun `une decoration posee porte ses emplacements figes`() {
        val choice = StickerSheetChoice.Template("time.digital", slots = mapOf("time" to "14:07"))
        assertThat(choice.slots).containsExactly("time", "14:07")
        assertThat(choice.usageEntry).isEqualTo(StickerUsageEntry.template("time.digital"))
    }

    @Test
    fun `un cadre a mots n'entre pas dans les recents, ses mots ne se rejouent pas`() {
        assertThat(StickerSheetChoice.Template("text.neon", slots = mapOf("text" to "Hey")).usageEntry).isNull()
    }
}
