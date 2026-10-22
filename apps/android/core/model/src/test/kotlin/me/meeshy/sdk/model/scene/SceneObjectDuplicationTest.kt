package me.meeshy.sdk.model.scene

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

@RunWith(JUnit4::class)
class SceneObjectDuplicationTest {

    @Test
    fun `un texte se duplique decale et garde son contenu`() {
        val out = SceneObjectDuplication.duplicate(SceneLists(texts = listOf(text("t1"))), "t1", "t2")!!
        assertThat(out.texts.map { it.id }).containsExactly("t1", "t2").inOrder()
        assertThat(out.texts[1].x).isGreaterThan(0.5)
        assertThat(out.texts[1].text).isEqualTo("t1")
    }

    @Test
    fun `un texte verrouille ne se duplique pas`() {
        assertThat(SceneObjectDuplication.duplicate(SceneLists(texts = listOf(text("t1", locked = true))), "t1", "t2")).isNull()
    }

    @Test
    fun `le plafond texte refuse la copie`() {
        val full = SceneLists(texts = (1..5).map { text("t$it") })
        assertThat(SceneObjectDuplication.duplicate(full, "t1", "x")).isNull()
    }

    @Test
    fun `le clone d un fond est de premier plan`() {
        val out = SceneObjectDuplication.duplicate(SceneLists(medias = listOf(media("bg", bg = true))), "bg", "c")!!
        assertThat(out.medias.single { it.id == "c" }.isBackground).isFalse()
        assertThat(out.medias.single { it.id == "bg" }.isBackground).isTrue()
    }

    @Test
    fun `un son se duplique en premier plan`() {
        val out = SceneObjectDuplication.duplicate(SceneLists(audios = listOf(audio("a1", bg = true))), "a1", "a2")!!
        assertThat(out.audios.single { it.id == "a2" }.isBackground).isFalse()
    }

    @Test
    fun `la scene pleine de dix medias refuse la copie`() {
        val full = SceneLists(medias = (1..10).map { media("m$it") })
        assertThat(SceneObjectDuplication.duplicate(full, "m1", "x")).isNull()
    }

    @Test
    fun `un identifiant inconnu ou un sticker ne se duplique pas`() {
        assertThat(SceneObjectDuplication.duplicate(SceneLists(), "nope", "x")).isNull()
        assertThat(SceneObjectDuplication.duplicate(SceneLists(stickers = listOf(sticker("s1"))), "s1", "x")).isNull()
    }
}
