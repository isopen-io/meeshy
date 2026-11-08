package me.meeshy.sdk.model.scene

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryEffects
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

@RunWith(JUnit4::class)
class SceneSlideDiffTest {

    private fun slide(
        id: String = "s1",
        texts: List<me.meeshy.sdk.model.StoryTextObject> = listOf(text("t1")),
        stickers: List<me.meeshy.sdk.model.StorySticker> = emptyList(),
        medias: List<me.meeshy.sdk.model.StoryMediaObject>? = null,
        bga: String? = null,
    ) = SceneSlide(id, StoryEffects(textObjects = texts, stickerObjects = stickers.ifEmpty { null }, mediaObjects = medias, backgroundAudioId = bga))

    @Test
    fun `deux slides au meme contenu sont egales pour le canvas`() {
        assertThat(SceneSlideDiff.equalForCanvas(slide(), slide())).isTrue()
        assertThat(SceneSlideDiff.change(slide(), slide())).isEqualTo(SceneSlideChange.Unchanged)
    }

    @Test
    fun `un id different ou un texte modifie rendent les slides differentes`() {
        assertThat(SceneSlideDiff.equalForCanvas(slide(), slide(id = "s2"))).isFalse()
        assertThat(SceneSlideDiff.equalForCanvas(slide(), slide(texts = listOf(text("t1", x = 0.9))))).isFalse()
    }

    @Test
    fun `les pastilles de lieu comptent dans l egalite`() {
        val base = slide()
        assertThat(SceneSlideDiff.equalForCanvas(base, base.copy(places = listOf(place("p"))))).isFalse()
    }

    @Test
    fun `l empreinte de structure ignore une frappe ou un deplacement`() {
        val moved = slide(texts = listOf(text("t1", x = 0.1, y = 0.9)))
        assertThat(SceneSlideDiff.structureFingerprint(moved)).isEqualTo(SceneSlideDiff.structureFingerprint(slide()))
    }

    @Test
    fun `l empreinte change a l ajout d un objet au passage en fond et au son de fond`() {
        val base = SceneSlideDiff.structureFingerprint(slide())
        assertThat(SceneSlideDiff.structureFingerprint(slide(stickers = listOf(sticker("s"))))).isNotEqualTo(base)
        val fg = SceneSlideDiff.structureFingerprint(slide(medias = listOf(media("m", bg = false))))
        val bg = SceneSlideDiff.structureFingerprint(slide(medias = listOf(media("m", bg = true))))
        assertThat(fg).isNotEqualTo(bg)
        assertThat(SceneSlideDiff.structureFingerprint(slide(bga = "a1"))).isNotEqualTo(base)
    }

    @Test
    fun `l empreinte ne depend pas de l ordre des listes`() {
        val a = slide(texts = listOf(text("a"), text("b")))
        val b = slide(texts = listOf(text("b"), text("a")))
        assertThat(SceneSlideDiff.structureFingerprint(a)).isEqualTo(SceneSlideDiff.structureFingerprint(b))
    }

    @Test
    fun `pendant un geste seule la transformee du noeud tenu change`() {
        val moved = slide(texts = listOf(text("t1", x = 0.9)))
        assertThat(SceneSlideDiff.change(slide(), moved, manipulatedId = "t1")).isEqualTo(SceneSlideChange.TransformOnly("t1"))
    }

    @Test
    fun `au lacher la scene se reconstruit sans relancer l audio si la composition est la meme`() {
        val moved = slide(texts = listOf(text("t1", x = 0.9)))
        assertThat(SceneSlideDiff.change(slide(), moved)).isEqualTo(SceneSlideChange.Rebuild(restartAudio = false))
    }

    @Test
    fun `un changement de composition ou de slide relance l audio`() {
        assertThat(SceneSlideDiff.change(slide(), slide(stickers = listOf(sticker("s"))))).isEqualTo(SceneSlideChange.Rebuild(true))
        assertThat(SceneSlideDiff.change(slide(), slide(id = "s2"), manipulatedId = "t1")).isEqualTo(SceneSlideChange.Rebuild(true))
    }
}
