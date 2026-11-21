package me.meeshy.sdk.model.game

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Ce qu'un gain de Gloire fait au rang (#19860, miroir de `gloryAfterGain`, `packages/shared/utils/game/glory.ts`, et de
 * `GameGlory.afterGain` iOS) : la frappe finit sur la gloire gagnée ET le pas vers le rang suivant. Mêmes cas que le
 * témoin partagé (`packages/shared/__tests__/game/glory-after-gain.test.ts`).
 */
class GloryAfterGainTest {

    private fun stepOf(rank: GloryRank, division5: Int): GloryStep =
        GloryLaws.ladder.first { it.rank == rank && it.division5 == division5 }

    @Test
    fun `sans marche franchie, la gloire qui manque jusqu'a la marche suivante, comptee apres le gain`() {
        assertThat(GloryLaws.afterGain(before = 0, gained = 100, mythic = false))
            .isEqualTo(GloryAfterGain.Toward(stepOf(GloryRank.Murmure, 4).minGlory - 100, GloryRank.Murmure, 4))
    }

    @Test
    fun `une division franchie dit le nouveau nom, avec sa division`() {
        val start = stepOf(GloryRank.Conteur, 3).minGlory
        assertThat(GloryLaws.afterGain(before = start - 1, gained = 1000, mythic = false))
            .isEqualTo(GloryAfterGain.Risen(GloryRank.Conteur, 3))
    }

    @Test
    fun `un rang franchi dit le nouveau rang, a sa division V`() {
        assertThat(GloryLaws.afterGain(before = 1500, gained = 1000, mythic = false)).isEqualTo(GloryAfterGain.Risen(GloryRank.Echo, 5))
    }

    @Test
    fun `atteindre la marche pile la franchit`() {
        assertThat(GloryLaws.afterGain(before = 1000, gained = 1000, mythic = false)).isEqualTo(GloryAfterGain.Risen(GloryRank.Echo, 5))
    }

    @Test
    fun `en Legende I, faute de suite, rien a dire`() {
        assertThat(GloryLaws.afterGain(before = stepOf(GloryRank.Legende, 1).minGlory + 10, gained = 1000, mythic = false)).isNull()
    }

    @Test
    fun `le Mythe vient du serveur, rien a dire meme sous le seuil`() {
        assertThat(GloryLaws.afterGain(before = 10, gained = 1000, mythic = true)).isNull()
    }

    @Test
    fun `un gain nul ou negatif ne fabrique pas de marche franchie`() {
        assertThat(GloryLaws.afterGain(before = 1500, gained = 0, mythic = false))
            .isEqualTo(GloryAfterGain.Toward(stepOf(GloryRank.Murmure, 1).minGlory - 1500, GloryRank.Murmure, 1))
        assertThat(GloryLaws.afterGain(before = -3, gained = -5, mythic = false))
            .isEqualTo(GloryAfterGain.Toward(stepOf(GloryRank.Murmure, 4).minGlory, GloryRank.Murmure, 4))
    }
}
