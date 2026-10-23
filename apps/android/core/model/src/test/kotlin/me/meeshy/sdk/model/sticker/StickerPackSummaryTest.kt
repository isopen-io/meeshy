package me.meeshy.sdk.model.sticker

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

class StickerPackSummaryTest {
    private val json = Json { ignoreUnknownKeys = true }

    @Test
    fun `un pack illisible tombe seul, les champs inconnus sont tolérés`() {
        val body = """[
          {"slug":"fruits","name":"Fruits","installed":true,"futur":1,
           "items":[{"key":"a","kind":"static"},{"key":"b","kind":"instant"},{"key":"c","kind":"cinematic"}]},
          {"name":"sans slug"},
          {"slug":"meo"}
        ]"""
        val list = json.decodeFromString(StickerPackList.serializer(), body)
        assertThat(list.packs.map { it.slug }).containsExactly("fruits", "meo").inOrder()
        assertThat(list.packs[0].sendableItems.map { it.key }).containsExactly("a", "c").inOrder()
        assertThat(list.packs[0].toInfo().sendableItemCount).isEqualTo(2)
    }

    @Test
    fun `un pack integre n'est pas retirable quand la passerelle se tait`() {
        assertThat(StickerPackSummary(slug = "mee").isRemovable).isFalse()
        assertThat(StickerPackSummary(slug = "fruits").isRemovable).isTrue()
        assertThat(StickerPackSummary(slug = "fruits", removable = false).isRemovable).isFalse()
    }
}
