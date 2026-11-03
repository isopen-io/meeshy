package me.meeshy.sdk.model.sticker

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class MeeStickerSectionTest {
    @Test
    fun `les titres suivent l'ordre des intentions de la feuille`() {
        val titles = MeeStickerSections.rows().filterIsInstance<MeeStickerRow.Title>().map { it.intent }
        assertThat(titles).isEqualTo(MeeStickerCatalog.sections.map { it.intent })
    }

    @Test
    fun `chaque rangée compte trois cases au plus et ne perd aucun sticker`() {
        val rows = MeeStickerSections.rows().filterIsInstance<MeeStickerRow.Stickers>()
        assertThat(rows.all { it.stickers.size in 1..3 }).isTrue()
        assertThat(rows.sumOf { it.stickers.size }).isEqualTo(MeeStickerCatalog.all.size)
    }

    @Test
    fun `un titre précède toujours ses rangées`() {
        assertThat(MeeStickerSections.rows().first()).isInstanceOf(MeeStickerRow.Title::class.java)
    }

    @Test
    fun `un pack intégré ne montre que sa distribution et aucun titre orphelin`() {
        MeeCharacter.entries.forEach { cast ->
            val rows = MeeStickerSections.rows(cast = cast)
            val stickers = rows.filterIsInstance<MeeStickerRow.Stickers>().flatMap { it.stickers }
            assertThat(stickers.all { it.character == cast }).isTrue()
            assertThat(stickers).hasSize(MeeStickerCatalog.stickers(cast).size)
            val titles = rows.filterIsInstance<MeeStickerRow.Title>()
            assertThat(titles.map { it.intent }).isEqualTo(MeeStickerCatalog.sections(cast).map { it.intent })
        }
    }

    @Test
    fun `les clés de rangées sont uniques`() {
        val keys = MeeStickerSections.rows().map { it.key }
        assertThat(keys.toSet()).hasSize(keys.size)
    }

    @Test
    fun `une liste à plat se range en rangées de trois`() {
        val rows = MeeStickerSections.rows(MeeStickerCatalog.all.take(7))
        assertThat(rows.map { it.stickers.size }).isEqualTo(listOf(3, 3, 1))
    }
}
