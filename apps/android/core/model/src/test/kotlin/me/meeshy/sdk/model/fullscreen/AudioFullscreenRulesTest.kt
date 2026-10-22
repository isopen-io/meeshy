package me.meeshy.sdk.model.fullscreen

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class AudioFullscreenRulesTest {

    @Test
    fun `la fenetre rend la page et ses deux voisines`() {
        val rendered = (0..6).filter { AudioFullscreenPaging.renders(it, current = 3) }
        assertThat(rendered).containsExactly(2, 3, 4).inOrder()
    }

    @Test
    fun `la page d entree part sans delai et la page tournee attend 160 ms`() {
        assertThat(AudioFullscreenPaging.playbackDelayMillis(turnedTo = false)).isEqualTo(0L)
        assertThat(AudioFullscreenPaging.playbackDelayMillis(turnedTo = true)).isEqualTo(160L)
    }

    @Test
    fun `une page traversee est perimee`() {
        assertThat(AudioFullscreenPaging.isStale("a", "b")).isTrue()
        assertThat(AudioFullscreenPaging.isStale("b", "b")).isFalse()
    }

    @Test
    fun `la position suit la liste du moment`() {
        assertThat(AudioFullscreenPaging.index("b", listOf("a", "b"))).isEqualTo(1)
        assertThat(AudioFullscreenPaging.index("x", listOf("a", "b"))).isNull()
        assertThat(AudioFullscreenPaging.index(null, listOf("a"))).isNull()
    }

    @Test
    fun `l ordre est la reception puis l arrivee`() {
        val items = listOf("c" to 3L, "a" to 1L, "b1" to 2L, "b2" to 2L)
        assertThat(AudioFullscreenSequence.ordered(items) { it.second }.map { it.first })
            .containsExactly("a", "b1", "b2", "c").inOrder()
    }

    @Test
    fun `suivant precedent et file a venir`() {
        val ids = listOf("a", "b", "c")
        assertThat(AudioFullscreenSequence.next("c", ids)).isNull()
        assertThat(AudioFullscreenSequence.next("a", ids)).isEqualTo("b")
        assertThat(AudioFullscreenSequence.previous("a", ids)).isNull()
        assertThat(AudioFullscreenSequence.previous("c", ids)).isEqualTo("b")
        assertThat(AudioFullscreenSequence.upcoming("a", ids)).containsExactly("b", "c").inOrder()
        assertThat(AudioFullscreenSequence.upcoming("z", ids)).isEmpty()
    }

    @Test
    fun `la page ne suit pas la piste que l ecran vient de demander`() {
        val ids = listOf("a", "b", "c")
        assertThat(AudioFullscreenSequence.pageToFollow("b", "a", ids)).isEqualTo("b")
        assertThat(AudioFullscreenSequence.pageToFollow("b", "a", ids, requestedByScreen = "b")).isNull()
        assertThat(AudioFullscreenSequence.pageToFollow("a", "a", ids)).isNull()
        assertThat(AudioFullscreenSequence.pageToFollow("z", "a", ids)).isNull()
    }

    @Test
    fun `portrait telephone empile et le portrait prend ce qui reste`() {
        val layout = AudioFullscreenLayout.resolve(width = 390f, height = 844f)
        assertThat(layout.arrangement).isEqualTo(AudioFullscreenArrangement.STACKED)
        assertThat(layout.heroDiameter).isAtLeast(72f)
        assertThat(layout.heroDiameter).isAtMost(168f)
        assertThat(layout.contentMaxWidth).isEqualTo(600f)
    }

    @Test
    fun `un conteneur minuscule garde le portrait minimal`() {
        assertThat(AudioFullscreenLayout.resolve(320f, 300f).heroDiameter).isEqualTo(72f)
    }

    @Test
    fun `un conteneur immense plafonne le portrait`() {
        assertThat(AudioFullscreenLayout.resolve(500f, 2000f).heroDiameter).isEqualTo(168f)
    }

    @Test
    fun `paysage court et tablette passent en deux colonnes`() {
        assertThat(AudioFullscreenLayout.resolve(800f, 380f).arrangement).isEqualTo(AudioFullscreenArrangement.SIDE_BY_SIDE)
        assertThat(AudioFullscreenLayout.resolve(900f, 1200f).arrangement).isEqualTo(AudioFullscreenArrangement.SIDE_BY_SIDE)
    }

    @Test
    fun `les paroles valent 2,4 fois le corps au plus et se ramenent a la largeur`() {
        assertThat(AudioFullscreenLayout.lyricSize(600f)).isEqualTo(34f)
        assertThat(AudioFullscreenLayout.lyricSize(200f)).isEqualTo(22f)
    }

    @Test
    fun `la rangee du bas garde un plancher au dessus de la barre d accueil`() {
        assertThat(AudioFullscreenLayout.bottomInset(0f)).isEqualTo(36f)
        assertThat(AudioFullscreenLayout.bottomInset(34f)).isEqualTo(42f)
    }

    @Test
    fun `le mot en cours se pose au premier tiers de la bande libre`() {
        assertThat(AudioFullscreenLayout.lyricAnchor(100f, 100f, 0f)).isEqualTo(0.5f)
        assertThat(AudioFullscreenLayout.lyricAnchor(100f, 100f, 700f)).isWithin(1e-4f).of(0.4f)
    }

    @Test
    fun `la hauteur minimale empilee inclut le cadran`() {
        assertThat(AudioFullscreenLayout.stackedMinimumHeight(100f))
            .isEqualTo(AudioFullscreenLayout.STACKED_CHROME + 100f + 80f)
    }
}
