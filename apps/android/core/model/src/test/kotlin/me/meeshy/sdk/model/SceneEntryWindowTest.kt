package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

@RunWith(JUnit4::class)
class SceneEntryWindowTest {

    @Test
    fun `l objet entre a la tete et dure jusqu a la fin`() {
        assertThat(SceneEntryWindow.forNewObject(2.0, 10.0)).isEqualTo(SceneEntryWindow.Window(2.0, 8.0))
    }

    @Test
    fun `l entree ne depasse jamais 80 pour cent de la duree`() {
        val w = SceneEntryWindow.forNewObject(9.9, 10.0)
        assertThat(w.start).isEqualTo(8.0)
        assertThat(w.duration).isEqualTo(2.0)
    }

    @Test
    fun `tete negative ou non finie et duree degeneree restent valides`() {
        assertThat(SceneEntryWindow.forNewObject(-3.0, 10.0).start).isEqualTo(0.0)
        assertThat(SceneEntryWindow.forNewObject(Double.NaN, 10.0)).isEqualTo(SceneEntryWindow.Window(0.0, 10.0))
        assertThat(SceneEntryWindow.forNewObject(4.0, Double.NaN)).isEqualTo(SceneEntryWindow.Window(0.0, 0.0))
    }

    private val effects = StoryEffects(
        textObjects = listOf(StoryTextObject(id = "t")),
        mediaObjects = listOf(StoryMediaObject(id = "m"), StoryMediaObject(id = "bg", isBackground = true)),
        stickerObjects = listOf(StorySticker(id = "s")),
        audioPlayerObjects = listOf(StoryAudioPlayerObject(id = "a")),
    )

    @Test
    fun `le fond est exclu des objets regles dans le temps`() {
        assertThat(effects.timedObjectIds()).containsExactly("t", "m", "s", "a").inOrder()
    }

    @Test
    fun `la fenetre se pose quelle que soit la famille et refuse le fond`() {
        val withText = effects.withWindow("t", 1.0, 2.0)!!
        assertThat(withText.textObjects.single().startTime).isEqualTo(1.0)
        assertThat(effects.withWindow("m", 1.0, 2.0)!!.mediaObjects!!.first().duration).isEqualTo(2.0)
        assertThat(effects.withWindow("s", 1.0, 2.0)!!.stickerObjects!!.single().startTime).isEqualTo(1.0)
        assertThat(effects.withWindow("a", 1.0, 2.0)!!.audioPlayerObjects!!.single().duration).isEqualTo(2f)
        assertThat(effects.withWindow("bg", 1.0, 2.0)).isNull()
        assertThat(effects.withWindow("ghost", 1.0, 2.0)).isNull()
    }
}
