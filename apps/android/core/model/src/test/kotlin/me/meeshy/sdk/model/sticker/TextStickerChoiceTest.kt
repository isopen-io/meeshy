package me.meeshy.sdk.model.sticker

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class TextStickerChoiceTest {

    private fun used(id: String) = StickerUsageEntry.template(id)

    @Test
    fun `sans usage ni favori, le premier cadre du catalogue est celui de la pastille`() {
        assertThat(TextStickerChoice.resolve(emptyList(), emptyList())?.id).isEqualTo("text.speechBubble")
    }

    @Test
    fun `l'usage passe avant l'epinglage`() {
        val choice = TextStickerChoice.resolve(listOf(used("text.neon")), listOf(used("text.stamp")))
        assertThat(choice?.id).isEqualTo("text.neon")
    }

    @Test
    fun `un favori sert quand aucun recent n'est un cadre a mots`() {
        val recents = listOf(StickerUsageEntry.emoji("😀"), used("love.heartFrame"), used("time.digital"))
        assertThat(TextStickerChoice.resolve(recents, listOf(used("text.tape")))?.id).isEqualTo("text.tape")
    }

    @Test
    fun `un gabarit sans emplacement de texte n'est jamais propose, un gabarit retire non plus`() {
        val recents = listOf(used("weather.sunny"), used("text.disparu"))
        assertThat(TextStickerChoice.resolve(recents, emptyList())?.id).isEqualTo("text.speechBubble")
    }

    @Test
    fun `la rotation commence par le cadre de l'auteur, compte dix cadres et n'a pas de doublon`() {
        val rotation = TextStickerChoice.rotation(listOf(used("text.ribbon")), emptyList())
        assertThat(rotation).hasSize(10)
        assertThat(rotation.first().id).isEqualTo("text.ribbon")
        assertThat(rotation.map { it.id }).containsNoDuplicates()
        assertThat(rotation.all { it.takesProse }).isTrue()
    }

    @Test
    fun `un catalogue vide n'a pas de pastille`() {
        assertThat(TextStickerChoice.resolve(listOf(used("text.neon")), emptyList(), catalog = emptyList())).isNull()
        assertThat(TextStickerChoice.rotation(emptyList(), emptyList(), catalog = emptyList())).isEmpty()
    }
}
