package me.meeshy.sdk.model.composer

import me.meeshy.sdk.model.scene.SceneLists
import me.meeshy.sdk.model.scene.audio
import me.meeshy.sdk.model.scene.media
import me.meeshy.sdk.model.scene.sticker
import me.meeshy.sdk.model.scene.text
import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

@RunWith(JUnit4::class)
class SceneObjectCapsTest {

    private fun refused(entry: SceneObjectCaps.Entry, lists: SceneLists) =
        (SceneObjectCaps.verdict(entry, lists) as? SceneObjectCaps.Verdict.Refused)?.reason

    @Test
    fun `une scene vide accepte toutes les entrees`() {
        SceneObjectCaps.Entry.values().forEach {
            assertThat(SceneObjectCaps.canAdd(it, SceneLists())).isTrue()
        }
    }

    @Test
    fun `les plafonds sont les cinquante de la decision porteur, depuis UNE source`() {
        assertThat(StoryLimits.OBJECTS_PER_FAMILY).isEqualTo(50)
        listOf(SceneObjectCaps.TEXT, SceneObjectCaps.STICKER, SceneObjectCaps.IMAGE, SceneObjectCaps.VIDEO, SceneObjectCaps.AUDIO, SceneObjectCaps.MEDIA)
            .forEach { assertThat(it).isEqualTo(StoryLimits.OBJECTS_PER_FAMILY) }
    }

    @Test
    fun `cinquante textes remplissent le plafond texte`() {
        val lists = SceneLists(texts = (1..50).map { text("t$it") })
        assertThat(refused(SceneObjectCaps.Entry.TEXT, lists)).isEqualTo(SceneObjectCaps.Reason.TEXT_FULL)
        assertThat(SceneObjectCaps.canAdd(SceneObjectCaps.Entry.TEXT, SceneLists(texts = (1..49).map { text("t$it") }))).isTrue()
    }

    @Test
    fun `cinquante images plafonnent les medias visuels`() {
        val lists = SceneLists(medias = (1..50).map { media("m$it", "image") })
        assertThat(refused(SceneObjectCaps.Entry.IMAGE, lists)).isEqualTo(SceneObjectCaps.Reason.MEDIA_FULL)
        assertThat(SceneObjectCaps.canAddMedia(lists)).isFalse()
    }

    @Test
    fun `cinquante sons plafonnent les sons sans toucher aux medias visuels`() {
        val lists = SceneLists(audios = (1..50).map { audio("a$it") })
        assertThat(refused(SceneObjectCaps.Entry.AUDIO, lists)).isEqualTo(SceneObjectCaps.Reason.AUDIO_FULL)
        assertThat(SceneObjectCaps.canAdd(SceneObjectCaps.Entry.IMAGE, lists)).isTrue()
        assertThat(SceneObjectCaps.canAdd(SceneObjectCaps.Entry.VIDEO, lists)).isTrue()
    }

    @Test
    fun `les sons ne consomment plus la place des medias`() {
        val lists = SceneLists(medias = (1..49).map { media("m$it", "image") }, audios = (1..40).map { audio("a$it") })
        assertThat(SceneObjectCaps.mediaCount(lists)).isEqualTo(49)
        assertThat(SceneObjectCaps.canAdd(SceneObjectCaps.Entry.IMAGE, lists)).isTrue()
        assertThat(SceneObjectCaps.canAdd(SceneObjectCaps.Entry.AUDIO, lists)).isTrue()
    }

    @Test
    fun `cinquante stickers remplissent le plafond sticker`() {
        val lists = SceneLists(stickers = (1..50).map { sticker("s$it") })
        assertThat(refused(SceneObjectCaps.Entry.STICKER, lists)).isEqualTo(SceneObjectCaps.Reason.STICKER_FULL)
    }

    @Test
    fun `les places restantes se comptent par seau`() {
        assertThat(SceneObjectCaps.remainingMediaSlots(visualMedia = 50)).isEqualTo(0)
        assertThat(SceneObjectCaps.remainingMediaSlots(visualMedia = 6)).isEqualTo(44)
        assertThat(SceneObjectCaps.remainingMediaSlots(visualMedia = 70)).isEqualTo(0)
        assertThat(SceneObjectCaps.canAddMedia(visualMedia = 50)).isFalse()
        assertThat(SceneObjectCaps.remainingAudioSlots(audios = 12)).isEqualTo(38)
    }
}
