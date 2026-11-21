package me.meeshy.sdk.model.game.ceremony

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.game.GameGlory
import me.meeshy.sdk.model.game.GameMintPreview
import me.meeshy.sdk.model.game.GloryAfterGain
import me.meeshy.sdk.model.game.GloryLaws
import me.meeshy.sdk.model.game.GloryRank
import me.meeshy.sdk.model.game.MeeshEdition
import org.junit.Test

/**
 * LA GLOIRE DE LA FRAPPE (#19860, miroir de `MintCeremonyGlory` iOS et du web) : la Gloire du joueur lue AU GESTE, celle
 * que l'aperçu promet, et le pas vers le rang suivant que la scène dit sous la gloire gagnée.
 */
class MintCeremonyGloryTest {

    private fun mint(gloryGained: Int) = GameMintPreview(
        number = 92, price = 250, canMint = true, missingPoints = 0, levelBefore = 12, levelAfter = 11, levelsLost = 1,
        gloryGained = gloryGained,
    )

    private fun glory(points: Int, rank: GloryRank = GloryRank.Murmure) = GameGlory(glory = points, rank = rank, progress = 0.5)

    @Test
    fun `la gloire lue au geste et celle que l'apercu promet disent le pas vers le rang suivant`() {
        val ceremony = MintCeremonyGlory.of(mint(gloryGained = 1000), glory(1500))
        assertThat(ceremony).isEqualTo(MintCeremonyGlory(before = 1500, gained = 1000, mythic = false))
        assertThat(ceremony.shownGain).isEqualTo(1000)
        assertThat(ceremony.step).isEqualTo(GloryAfterGain.Risen(GloryRank.Echo, 5))
    }

    @Test
    fun `un apercu qui ne promet rien ecrit la constante de la frappe`() {
        val ceremony = MintCeremonyGlory(before = 0, gained = 0, mythic = false)
        assertThat(ceremony.shownGain).isEqualTo(GloryLaws.POINTS_MINT)
        assertThat(ceremony.step).isEqualTo(GloryLaws.afterGain(before = 0, gained = GloryLaws.POINTS_MINT, mythic = false))
    }

    @Test
    fun `le Mythe servi n'a pas de pas a dire`() {
        assertThat(MintCeremonyGlory.of(mint(1000), glory(10, GloryRank.Mythe)).step).isNull()
    }

    @Test
    fun `la demande porte la gloire du toucher, absente par defaut`() {
        val bare = MintCeremonyRequest(92, MeeshEdition.Silver, settled = null)
        assertThat(bare.glory).isNull()
        val withGlory = MintCeremonyRequest(92, MeeshEdition.Silver, settled = null, glory = MintCeremonyGlory(1500, 1000, false))
        assertThat(withGlory.glory?.step).isEqualTo(GloryAfterGain.Risen(GloryRank.Echo, 5))
    }
}
