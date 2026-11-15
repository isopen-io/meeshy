package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StoryStickerLibraryTest {
    private fun media(id: String, url: String? = "https://cdn/$id.png") = FeedMedia(id = id, url = url)

    private fun story(stickers: List<StorySticker>?, media: List<FeedMedia>) =
        StoryItem(id = "story-1", media = media, storyEffects = stickers?.let { StoryEffects(stickerObjects = it) })

    private fun image(id: String, mediaId: String) = StorySticker(id = id, postMediaId = mediaId)

    @Test
    fun `des stickers emoji seuls ne donnent aucun geste`() {
        val item = story(listOf(StorySticker(id = "s", emoji = "🎉")), listOf(media("m1")))
        assertThat(StoryStickerLibrary.savable(item)).isEmpty()
    }

    @Test
    fun `sans effets la liste est vide`() {
        assertThat(StoryStickerLibrary.savable(story(null, emptyList()))).isEmpty()
    }

    @Test
    fun `l'url est prise sur le media du post et l'ordre de composition est garde`() {
        val item = story(
            listOf(StorySticker(id = "e", emoji = "🎉"), image("a", "m2"), image("b", "m1")),
            listOf(media("m1"), media("m2", "https://cdn/two.png"), media("autre")),
        )
        assertThat(StoryStickerLibrary.savable(item)).containsExactly(
            StoryStickerLibrary.Savable("received-m2", "https://cdn/two.png"),
            StoryStickerLibrary.Savable("received-m1", "https://cdn/m1.png"),
        ).inOrder()
    }

    @Test
    fun `un media absent ou sans url n'est pas offert`() {
        val item = story(
            listOf(image("a", "absent"), image("b", "m1")),
            listOf(media("m1", url = null)),
        )
        assertThat(StoryStickerLibrary.savable(item)).isEmpty()
    }

    @Test
    fun `deux stickers du meme media ne font qu'une entree`() {
        val item = story(listOf(image("a", "m1"), image("b", "m1")), listOf(media("m1")))
        assertThat(StoryStickerLibrary.savable(item)).hasSize(1)
    }

    @Test
    fun `l'id est stable et prefixe`() {
        assertThat(StoryStickerLibrary.libraryId("68a1b2c3")).isEqualTo("received-68a1b2c3")
        assertThat(StoryStickerLibrary.libraryId("68a1b2c3")).isEqualTo(StoryStickerLibrary.libraryId("68a1b2c3"))
    }

    @Test
    fun `un id impropre a un nom de fichier est refuse`() {
        listOf("", "../x", "a/b", "a\\b", "a.b", "é").forEach {
            assertThat(StoryStickerLibrary.libraryId(it)).isNull()
        }
        val item = story(listOf(image("a", "../evil")), listOf(media("../evil")))
        assertThat(StoryStickerLibrary.savable(item)).isEmpty()
    }
}
