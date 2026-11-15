package me.meeshy.sdk.model.fullscreen

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.appearance.AvatarRingDecor
import me.meeshy.sdk.model.pack.PackAssetRef
import org.junit.Test

class AudioFullscreenHeroGeometryTest {

    private val film = PackAssetRef(src = "b19ebab0f4cfeed8.json", bytes = 10, sha256 = "b19ebab0f4cfeed8" + "0".repeat(48))

    private fun decor(reach: Double = AvatarRingDecor.MAX_REACH) = AvatarRingDecor(reach = reach, back = film)

    private fun sizes() = listOf(72f, 90f, 117f, 135f, 168f)

    @Test
    fun `un telephone en portrait donne 135 dp au portrait`() {
        assertThat(AudioFullscreenHeroGeometry.resolve(390f, 844f, null).portraitDiameter).isEqualTo(135f)
    }

    @Test
    fun `un paysage court donne 117 dp au portrait`() {
        assertThat(AudioFullscreenHeroGeometry.resolve(844f, 390f, null).portraitDiameter).isEqualTo(117f)
    }

    @Test
    fun `le portrait ne descend jamais sous 72 dp ni ne monte au dessus de 168 dp`() {
        assertThat(AudioFullscreenHeroGeometry.resolve(200f, 300f, decor()).portraitDiameter).isEqualTo(72f)
        assertThat(AudioFullscreenHeroGeometry.resolve(2000f, 3000f, decor()).portraitDiameter).isEqualTo(168f)
    }

    @Test
    fun `l anneau de barres commence a l ecart du portrait et finit au bord de la bande`() {
        val hero = AudioFullscreenHeroGeometry.of(135f, null)

        assertThat(hero.ringInnerRadius).isEqualTo(67.5f + AudioDialGeometry.GAP)
        assertThat(hero.ringOuterRadius).isEqualTo(67.5f + AudioDialGeometry.BAND)
        assertThat(hero.side).isEqualTo(135f + 2 * AudioDialGeometry.BAND)
        assertThat(hero.cursorOrbit).isEqualTo(hero.ringInnerRadius + AudioDialGeometry.BAR_LENGTH / 2f)
    }

    @Test
    fun `sans decoration l avatar seul tient le portrait`() {
        val hero = AudioFullscreenHeroGeometry.of(135f, null)

        assertThat(hero.decorOuterRadius).isNull()
        assertThat(hero.avatarFootprint).isEqualTo(135f)
        assertThat(hero.decorRoom).isEqualTo(0f)
    }

    @Test
    fun `une decoration au debord maximal reste dans le portrait donc sous l anneau`() {
        val hero = AudioFullscreenHeroGeometry.of(135f, decor(1.5))

        assertThat(hero.decorOuterRadius).isEqualTo(67.5f)
        assertThat(hero.avatarFootprint).isEqualTo(135f)
    }

    @Test
    fun `la decoration ne mord jamais l ecart de l anneau en portrait comme en paysage`() {
        val screens = listOf(390f to 844f, 844f to 390f, 200f to 300f, 2000f to 3000f, 1024f to 600f, 360f to 640f)
        screens.forEach { (w, h) ->
            listOf(1.0, 1.2, 1.5).forEach { reach ->
                val hero = AudioFullscreenHeroGeometry.resolve(w, h, decor(reach))
                assertThat(hero.decorOuterRadius!!).isAtMost(hero.ringInnerRadius - AudioDialGeometry.GAP)
            }
        }
    }

    @Test
    fun `la decoration tient sous l anneau a chaque diametre du portrait`() {
        sizes().forEach { size ->
            val hero = AudioFullscreenHeroGeometry.of(size, decor())
            assertThat(hero.decorOuterRadius!!).isAtMost(hero.ringInnerRadius - AudioDialGeometry.GAP)
            assertThat(hero.decorOuterRadius!!).isAtMost(hero.portraitDiameter / 2f)
        }
    }

    @Test
    fun `le curseur tenu par le doigt ne mord jamais le portrait`() {
        sizes().forEach { size ->
            val hero = AudioFullscreenHeroGeometry.of(size, decor())
            val inner = hero.cursorOrbit - (AudioDialGeometry.CURSOR_SCRUB_RADIUS + AudioDialGeometry.CURSOR_HALO)
            assertThat(inner).isGreaterThan(hero.portraitDiameter / 2f)
        }
    }

    @Test
    fun `le curseur tenu par le doigt reste dans la bande saisissable`() {
        sizes().forEach { size ->
            val hero = AudioFullscreenHeroGeometry.of(size, null)
            val outer = hero.cursorOrbit + AudioDialGeometry.CURSOR_SCRUB_RADIUS + AudioDialGeometry.CURSOR_HALO
            assertThat(outer).isAtMost(hero.side / 2f)
        }
    }
}
