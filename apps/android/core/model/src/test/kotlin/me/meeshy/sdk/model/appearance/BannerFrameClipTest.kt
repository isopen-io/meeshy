package me.meeshy.sdk.model.appearance

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.appearance.AppearanceFixtures.frameJson
import org.junit.Test

class BannerFrameClipTest {

    private val design = AppearanceFixtures.json.decodeFromString(BannerFrameDesign.serializer(), frameJson().toString())
    private val width = 300.0

    private val clip = BannerFrameRenderer.clip(design, width)

    @Test
    fun `l'enroulement non nul couvre le pourtour de la bordure`() {
        assertThat(clip.covers(4.0, 50.0)).isTrue()
        assertThat(clip.covers(150.0, 4.0)).isTrue()
        assertThat(clip.covers(296.0, 50.0)).isTrue()
        assertThat(clip.covers(150.0, 96.0)).isTrue()
    }

    @Test
    fun `aucun point du centre transparent n'est couvert`() {
        val points = (0..40).flatMap { column -> (0..20).map { row -> (30.0 + column * 6.0) to (22.0 + row * 3.0) } }

        points.forEach { (x, y) -> assertThat(clip.covers(x, y)).isFalse() }
    }

    @Test
    fun `les coins entrent dans la region au-dela de la bordure`() {
        assertThat(clip.covers(12.0, 12.0)).isTrue()
        assertThat(clip.covers(288.0, 88.0)).isTrue()
        assertThat(clip.covers(20.0, 20.0)).isFalse()
    }

    @Test
    fun `le cartouche entre dans la region au centre du bord choisi`() {
        assertThat(clip.covers(150.0, 11.0)).isTrue()
        assertThat(clip.covers(150.0, 89.0)).isFalse()
    }

    @Test
    fun `la region suit la largeur logique`() {
        val wide = BannerFrameRenderer.clip(design, 400.0)

        assertThat(wide.covers(396.0, 50.0)).isTrue()
        assertThat(wide.covers(200.0, 50.0)).isFalse()
        assertThat(wide.covers(200.0, 11.0)).isTrue()
    }
}
