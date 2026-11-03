package me.meeshy.sdk.model.scene

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.SharedPlace
import me.meeshy.sdk.model.StoryAudioPlayerObject
import me.meeshy.sdk.model.StoryLocationObject
import me.meeshy.sdk.model.StoryMediaObject
import me.meeshy.sdk.model.StorySticker
import me.meeshy.sdk.model.StoryTextObject
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

@RunWith(JUnit4::class)
class SceneObjectPredicatesTest {

    private fun scene(
        texts: List<StoryTextObject> = emptyList(),
        medias: List<StoryMediaObject> = emptyList(),
        stickers: List<StorySticker> = emptyList(),
        places: List<StoryLocationObject> = emptyList(),
        audios: List<StoryAudioPlayerObject> = emptyList(),
    ) = SceneLists(texts, medias, stickers, places, audios)

    @Test
    fun `seul un texte marque verrouille est verrouille`() {
        val lists = scene(
            texts = listOf(StoryTextObject("t", isLocked = true), StoryTextObject("free")),
            stickers = listOf(StorySticker("s")),
        )
        assertThat(SceneObjectPredicates.isLocked(lists, "t")).isTrue()
        assertThat(SceneObjectPredicates.isLocked(lists, "free")).isFalse()
        assertThat(SceneObjectPredicates.isLocked(lists, "s")).isFalse()
        assertThat(SceneObjectPredicates.isLocked(lists, "ghost")).isFalse()
    }

    @Test
    fun `un media et un son peuvent occuper le fond, un texte jamais`() {
        val lists = scene(
            texts = listOf(StoryTextObject("t")),
            medias = listOf(StoryMediaObject("m", isBackground = true), StoryMediaObject("m2")),
            audios = listOf(StoryAudioPlayerObject("a", isBackground = true)),
        )
        assertThat(SceneObjectPredicates.isBackground(lists, "m")).isTrue()
        assertThat(SceneObjectPredicates.isBackground(lists, "a")).isTrue()
        assertThat(SceneObjectPredicates.isBackground(lists, "m2")).isFalse()
        assertThat(SceneObjectPredicates.isBackground(lists, "t")).isFalse()
    }

    @Test
    fun `une video et un son se rognent, une image un texte un sticker un lieu non`() {
        val lists = scene(
            texts = listOf(StoryTextObject("t")),
            medias = listOf(StoryMediaObject("v", mediaType = "video"), StoryMediaObject("i", mediaType = "image")),
            stickers = listOf(StorySticker("s")),
            places = listOf(StoryLocationObject("p", SharedPlace(1.0, 2.0))),
            audios = listOf(StoryAudioPlayerObject("a")),
        )
        assertThat(SceneObjectPredicates.hasTrimmableSource(lists, "v")).isTrue()
        assertThat(SceneObjectPredicates.hasTrimmableSource(lists, "a")).isTrue()
        listOf("i", "t", "s", "p", "ghost").forEach {
            assertThat(SceneObjectPredicates.hasTrimmableSource(lists, it)).isFalse()
        }
    }

    @Test
    fun `un frere de plan est un objet pose de n'importe quel type`() {
        val lists = scene(
            texts = listOf(StoryTextObject("t")),
            stickers = listOf(StorySticker("s")),
            medias = listOf(StoryMediaObject("bg", isBackground = true)),
        )
        assertThat(SceneObjectPredicates.sharesPlaneWithAnother(lists, "t")).isTrue()
        val alone = scene(texts = listOf(StoryTextObject("t")), medias = listOf(StoryMediaObject("bg", isBackground = true)))
        assertThat(SceneObjectPredicates.sharesPlaneWithAnother(alone, "t")).isFalse()
    }
}
