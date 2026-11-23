package me.meeshy.app.game.ceremony

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.game.MeeshEdition
import me.meeshy.sdk.model.game.ceremony.MintCeremonyAnswer
import me.meeshy.sdk.model.game.ceremony.MintCeremonyRequest
import me.meeshy.sdk.model.game.ceremony.MintCeremonyRun
import org.junit.Test

/**
 * CE QUE TALKBACK DIT DE LA FRAPPE (#20141) — la scène est UN élément : la phrase de Mee tant que le marteau est levé,
 * la raison d'un refus, et, la frappe confirmée, la gloire gagnée puis le pas vers le rang suivant. Même forme qu'iOS
 * (`MintCeremonyCopy.confirmed`) et le web (`mintGlorySpoken`).
 */
class MintCeremonySpokenTest {

    private val words = MintCeremonyWords(
        light = "ta lumière",
        tchak = "Tchak !",
        tchakFinal = "TCHAK !",
        ancestors = "Tes aïeux se manifestent",
        ancestorsLine = "chaque centième pièce porte leur lumière",
        say = "La n° 92 rejoint ton Héritage.",
        glory = "+1 000 de gloire",
        gloryStep = "1 200 de gloire jusqu’à Conteur II",
    )

    private fun started(): MintCeremonyRun =
        MintCeremonyRun.start(MintCeremonyRequest(92, MeeshEdition.Silver, settled = null), reduced = false, modest = false, prepared = null)

    @Test
    fun `le marteau leve, la scene dit la phrase de Mee seule`() {
        assertThat(mintCeremonySpoken(words, started())).isEqualTo("La n° 92 rejoint ton Héritage.")
    }

    @Test
    fun `la frappe confirmee dit la phrase de Mee, la gloire gagnee, puis le pas vers le rang suivant`() {
        val run = started().receive(MintCeremonyAnswer.Confirmed(92), atMs = 6000.0)
        assertThat(mintCeremonySpoken(words, run))
            .isEqualTo("La n° 92 rejoint ton Héritage. +1 000 de gloire. 1 200 de gloire jusqu’à Conteur II.")
    }

    @Test
    fun `sans pas vers un rang (Mythe, Legende I), la gloire gagnee et rien de plus`() {
        val run = started().receive(MintCeremonyAnswer.Confirmed(92), atMs = 6000.0)
        assertThat(mintCeremonySpoken(words.copy(gloryStep = null), run)).isEqualTo("La n° 92 rejoint ton Héritage. +1 000 de gloire.")
    }

    @Test
    fun `un refus dit sa raison, sans gloire`() {
        val run = started().receive(MintCeremonyAnswer.Refused("TREASURY_LOCKED"), atMs = 2000.0)
        assertThat(mintCeremonySpoken(words.copy(say = "Ton Héritage attend un rang plus haut."), run)).isEqualTo("Ton Héritage attend un rang plus haut.")
    }
}
