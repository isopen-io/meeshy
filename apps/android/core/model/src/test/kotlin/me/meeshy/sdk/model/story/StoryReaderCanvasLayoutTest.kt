package me.meeshy.sdk.model.story

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.composer.StoryCanvasFraming.Presentation
import org.junit.Test

class StoryReaderCanvasLayoutTest {
    @Test
    fun `au repos la scene est une carte arrondie avec son ombre`() {
        val r = StoryReaderCanvasLayout.framing(360f, 780f, topInset = 24f, isFullscreenSession = false, chromeVisible = true)
        assertThat(StoryReaderCanvasLayout.presentation(false, true)).isEqualTo(Presentation.CARDED)
        assertThat(r.scale).isLessThan(1f)
        assertThat(r.cornerRadius).isEqualTo(22f)
        assertThat(StoryReaderCanvasLayout.shadowAlpha(StoryReaderCanvasLayout.isExpanded(false, true))).isEqualTo(0.4f)
    }

    @Test
    fun `chrome masque la scene passe plein bord sans ombre ni arrondi`() {
        val r = StoryReaderCanvasLayout.framing(360f, 780f, 24f, isFullscreenSession = false, chromeVisible = false)
        assertThat(r.scale).isEqualTo(1f)
        assertThat(r.cornerRadius).isEqualTo(0f)
        assertThat(StoryReaderCanvasLayout.isExpanded(false, false)).isTrue()
        assertThat(StoryReaderCanvasLayout.shadowAlpha(true)).isEqualTo(0f)
    }

    @Test
    fun `la session plein ecran est immersive et couvre le viewport`() {
        val r = StoryReaderCanvasLayout.framing(360f, 780f, 24f, isFullscreenSession = true, chromeVisible = true)
        assertThat(StoryReaderCanvasLayout.presentation(true, true)).isEqualTo(Presentation.IMMERSIVE)
        assertThat(r.scale).isAtLeast(1f)
        assertThat(r.cornerRadius).isEqualTo(0f)
        assertThat(StoryReaderCanvasLayout.isExpanded(true, true)).isTrue()
    }

    @Test
    fun `la saisie d'un commentaire redevient carte meme en plein ecran`() {
        assertThat(StoryReaderCanvasLayout.presentation(true, false, lifted = true)).isEqualTo(Presentation.CARDED)
        val libre = StoryReaderCanvasLayout.framing(360f, 780f, 24f, false, true)
        val leve = StoryReaderCanvasLayout.framing(360f, 780f, 24f, false, true, composerReserve = 300f)
        assertThat(leve.scale).isLessThan(libre.scale)
    }

    @Test
    fun `les commentaires ouverts floutent la scene`() {
        assertThat(StoryReaderSceneFocus.blurRadius(true)).isEqualTo(6f)
        assertThat(StoryReaderSceneFocus.blurRadius(false)).isEqualTo(0f)
    }
}
