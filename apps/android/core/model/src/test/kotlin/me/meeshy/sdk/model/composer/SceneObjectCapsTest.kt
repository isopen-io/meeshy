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
    fun `cinq textes remplissent le plafond texte`() {
        val lists = SceneLists(texts = (1..5).map { text("t$it") })
        assertThat(refused(SceneObjectCaps.Entry.TEXT, lists)).isEqualTo(SceneObjectCaps.Reason.TEXT_FULL)
        assertThat(SceneObjectCaps.canAdd(SceneObjectCaps.Entry.TEXT, SceneLists(texts = (1..4).map { text("t$it") }))).isTrue()
    }

    @Test
    fun `cinq images plafonnent les images mais pas les videos`() {
        val lists = SceneLists(medias = (1..5).map { media("m$it", "image") })
        assertThat(refused(SceneObjectCaps.Entry.IMAGE, lists)).isEqualTo(SceneObjectCaps.Reason.IMAGE_FULL)
        assertThat(SceneObjectCaps.canAdd(SceneObjectCaps.Entry.VIDEO, lists)).isTrue()
    }

    @Test
    fun `quatre videos plafonnent les videos`() {
        val lists = SceneLists(medias = (1..4).map { media("v$it", "video") })
        assertThat(refused(SceneObjectCaps.Entry.VIDEO, lists)).isEqualTo(SceneObjectCaps.Reason.VIDEO_FULL)
    }

    @Test
    fun `cinq sons plafonnent les sons`() {
        val lists = SceneLists(audios = (1..5).map { audio("a$it") })
        assertThat(refused(SceneObjectCaps.Entry.AUDIO, lists)).isEqualTo(SceneObjectCaps.Reason.AUDIO_FULL)
    }

    @Test
    fun `dix medias et sons confondus remplissent la scene pour toutes les entrees media`() {
        val lists = SceneLists(
            medias = (1..4).map { media("i$it", "image") } + (1..2).map { media("v$it", "video") },
            audios = (1..4).map { audio("a$it") },
        )
        assertThat(SceneObjectCaps.mediaCount(lists)).isEqualTo(10)
        listOf(SceneObjectCaps.Entry.IMAGE, SceneObjectCaps.Entry.VIDEO, SceneObjectCaps.Entry.AUDIO).forEach {
            assertThat(refused(it, lists)).isEqualTo(SceneObjectCaps.Reason.MEDIA_FULL)
        }
        assertThat(SceneObjectCaps.canAdd(SceneObjectCaps.Entry.TEXT, lists)).isTrue()
    }

    @Test
    fun `les fonds comptent contre le plafond des medias`() {
        val lists = SceneLists(medias = (1..10).map { media("m$it", "image", bg = it == 1) }.take(5) + (1..5).map { media("v$it", "video") })
        assertThat(SceneObjectCaps.canAddMedia(lists)).isFalse()
    }

    @Test
    fun `trente stickers remplissent le plafond sticker`() {
        val lists = SceneLists(stickers = (1..30).map { sticker("s$it") })
        assertThat(refused(SceneObjectCaps.Entry.STICKER, lists)).isEqualTo(SceneObjectCaps.Reason.STICKER_FULL)
    }
}
