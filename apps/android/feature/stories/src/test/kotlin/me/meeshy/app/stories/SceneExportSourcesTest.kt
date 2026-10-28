package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryAudioPlayerObject
import me.meeshy.sdk.model.UploadedMedia
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

@RunWith(JUnit4::class)
class SceneExportSourcesTest {

    private val base = StoryComposerUiState()

    private fun withBackground(mime: String, durationMs: Long?): StoryComposerUiState {
        val media = UploadedMedia("m1", "https://x/m1", mime, 1L, null, null, durationMs, null)
        return base.copy(attachments = listOf(media))
            .withDeckTransform { it.addMediaToSelected("m1").toggleSelectedBackgroundMedia("m1") }
    }

    @Test
    fun `une scene sans fond video est un fixe qui dure la duree de la slide`() {
        val sources = SceneExportSources.from(StoryComposerBackgroundReducer.durationChanged(base, 7.0)) { null }
        assertThat(sources.video).isNull()
        assertThat(sources.durationSeconds).isEqualTo(7.0)
    }

    @Test
    fun `un fond image reste un fixe`() {
        assertThat(SceneExportSources.from(withBackground("image/jpeg", null)) { null }.video).isNull()
    }

    @Test
    fun `un fond video porte son adresse et sa duree`() {
        val sources = SceneExportSources.from(withBackground("video/mp4", 12_000L)) { null }
        assertThat(sources.video).isEqualTo(
            SceneExportSources.Video(url = "https://x/m1", assetDurationSeconds = 12.0, muted = false),
        )
    }

    @Test
    fun `seuls les sons dont l adresse se resout partent, avec leur fenetre`() {
        val borrowed = StoryAudioPlayerObject(id = "a", startTime = 1f, duration = 3f, volume = 0.5f, mediaURL = "/lib/a.mp3")
        val unresolvable = StoryAudioPlayerObject(id = "b", postMediaId = "pm")
        val state = base.withDeckTransform { deck ->
            deck.copy(slides = deck.slides.map { it.copy(audio = listOf(borrowed, unresolvable)) })
        }
        val sources = SceneExportSources.from(state) { if (it.id == "a") "https://x/lib/a.mp3" else null }
        assertThat(sources.sounds).hasSize(1)
        val sound = sources.sounds.single()
        assertThat(sound.url).isEqualTo("https://x/lib/a.mp3")
        assertThat(sound.input.startSeconds).isEqualTo(1.0)
        assertThat(sound.input.endSeconds).isEqualTo(4.0)
        assertThat(sound.input.volume).isEqualTo(0.5)
    }

    @Test
    fun `une scene a baker se reconnait a un texte, un fond ou un media`() {
        assertThat(SceneExportSources.hasScene(base)).isFalse()
        val blank = StoryComposerTextReducer.added(base, "t")
        assertThat(SceneExportSources.hasScene(blank)).isFalse()
        val written = blank.withDeckTransform { it.updateTextElement("t") { e -> e.copy(text = "Salut") } }
        assertThat(SceneExportSources.hasScene(written)).isTrue()
        assertThat(SceneExportSources.hasScene(StoryComposerBackgroundReducer.backgroundChanged(base,
            me.meeshy.sdk.model.StoryBackgroundValue.Hex("112233")))).isTrue()
    }
}
