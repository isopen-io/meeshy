package me.meeshy.sdk.model.scene

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryAudioPlayerObject
import me.meeshy.sdk.model.StoryEffects
import me.meeshy.sdk.model.StoryMediaObject
import me.meeshy.sdk.model.StorySlide
import me.meeshy.sdk.model.StoryTextObject
import org.junit.Test

class AudioPassIdentityTest {
    private fun slide(effects: StoryEffects = StoryEffects(), id: String = "s1") = StorySlide(id = id, effects = effects)
    private fun audio(id: String, bg: Boolean? = null, x: Double = 0.5) =
        StoryAudioPlayerObject(id = id, isBackground = bg, x = x)
    private fun video(id: String, x: Double = 0.5) = StoryMediaObject(id = id, mediaType = "video", x = x)
    private val langs = listOf("fr", "en")

    @Test fun `stable quand on deplace un objet audio ou video`() {
        val before = slide(StoryEffects(audioPlayerObjects = listOf(audio("a")), mediaObjects = listOf(video("v"))))
        val after = slide(StoryEffects(audioPlayerObjects = listOf(audio("a", x = 0.1)), mediaObjects = listOf(video("v", x = 0.9))))
        assertThat(AudioPassIdentity.key(after, langs)).isEqualTo(AudioPassIdentity.key(before, langs))
    }

    @Test fun `stable quand on edite un texte ou le volume`() {
        val base = StoryEffects(audioPlayerObjects = listOf(audio("a")))
        val edited = base.copy(
            textObjects = listOf(StoryTextObject(id = "t", text = "bonjour")),
            audioPlayerObjects = listOf(audio("a").copy(volume = 0.2f)),
        )
        assertThat(AudioPassIdentity.key(slide(edited), langs)).isEqualTo(AudioPassIdentity.key(slide(base), langs))
    }

    @Test fun `change a l'ajout d'un objet audio`() {
        val before = slide(StoryEffects(audioPlayerObjects = listOf(audio("a"))))
        val after = slide(StoryEffects(audioPlayerObjects = listOf(audio("a"), audio("b"))))
        assertThat(AudioPassIdentity.key(after, langs)).isNotEqualTo(AudioPassIdentity.key(before, langs))
    }

    @Test fun `change a la suppression d'une video`() {
        val before = slide(StoryEffects(mediaObjects = listOf(video("v"))))
        val after = slide(StoryEffects())
        assertThat(AudioPassIdentity.key(after, langs)).isNotEqualTo(AudioPassIdentity.key(before, langs))
    }

    @Test fun `change quand un clip devient audio de fond`() {
        val a = slide(StoryEffects(audioPlayerObjects = listOf(audio("a", bg = false))))
        val b = slide(StoryEffects(audioPlayerObjects = listOf(audio("a", bg = true))))
        assertThat(AudioPassIdentity.key(a, langs)).isNotEqualTo(AudioPassIdentity.key(b, langs))
    }

    @Test fun `l'ordre des objets n'a pas d'effet`() {
        val a = slide(StoryEffects(audioPlayerObjects = listOf(audio("a"), audio("b"))))
        val b = slide(StoryEffects(audioPlayerObjects = listOf(audio("b"), audio("a"))))
        assertThat(AudioPassIdentity.key(a, langs)).isEqualTo(AudioPassIdentity.key(b, langs))
    }

    @Test fun `change avec la slide ou les langues`() {
        val s = slide()
        assertThat(AudioPassIdentity.key(slide(id = "s2"), langs)).isNotEqualTo(AudioPassIdentity.key(s, langs))
        assertThat(AudioPassIdentity.key(s, listOf("en"))).isNotEqualTo(AudioPassIdentity.key(s, langs))
    }

    @Test fun `une image ajoutee ne coupe pas la musique`() {
        val before = slide(StoryEffects(audioPlayerObjects = listOf(audio("m", bg = true))))
        val after = slide(StoryEffects(
            audioPlayerObjects = listOf(audio("m", bg = true)),
            mediaObjects = listOf(StoryMediaObject(id = "i", mediaType = "image")),
        ))
        assertThat(AudioPassIdentity.key(after, langs)).isEqualTo(AudioPassIdentity.key(before, langs))
    }
}
