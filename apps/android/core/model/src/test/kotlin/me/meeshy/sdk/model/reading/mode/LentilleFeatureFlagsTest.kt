package me.meeshy.sdk.model.reading.mode

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class LentilleFeatureFlagsTest {

    @Test
    fun `les trois drapeaux sont actifs tant qu'aucun choix n'est écrit`() {
        val flags = LentilleFeatureFlags()
        LentilleFeatureFlag.entries.forEach { assertThat(flags.isEnabled(it)).isTrue() }
    }

    @Test
    fun `couper un drapeau ne touche pas les deux autres`() {
        val flags = LentilleFeatureFlags().with(LentilleFeatureFlag.LENTILLE_LIST, false)
        assertThat(flags.isEnabled(LentilleFeatureFlag.LENTILLE_LIST)).isFalse()
        assertThat(flags.isEnabled(LentilleFeatureFlag.READING_MODES)).isTrue()
        assertThat(flags.isEnabled(LentilleFeatureFlag.RIVIERE_MODE)).isTrue()
    }

    @Test
    fun `rallumer un drapeau coupé le rétablit`() {
        val flags = LentilleFeatureFlags()
            .with(LentilleFeatureFlag.READING_MODES, false)
            .with(LentilleFeatureFlag.READING_MODES, true)
        assertThat(flags).isEqualTo(LentilleFeatureFlags())
    }

    @Test
    fun `la Rivière n'est réglable que lorsque les modes de lecture sont actifs`() {
        val on = LentilleFeatureFlags()
        val off = on.with(LentilleFeatureFlag.READING_MODES, false)
        assertThat(on.isRiviereAdjustable).isTrue()
        assertThat(off.isRiviereAdjustable).isFalse()
    }

    @Test
    fun `couper les modes de lecture garde le choix de la Rivière pour le rallumage`() {
        val flags = LentilleFeatureFlags()
            .with(LentilleFeatureFlag.RIVIERE_MODE, false)
            .with(LentilleFeatureFlag.READING_MODES, false)
            .with(LentilleFeatureFlag.READING_MODES, true)
        assertThat(flags.isEnabled(LentilleFeatureFlag.RIVIERE_MODE)).isFalse()
    }

    @Test
    fun `les clés de stockage sont celles d'iOS, que le fil de discussion lit déjà`() {
        assertThat(LentilleFeatureFlag.entries.associate { it.name to it.storageKey }).containsExactly(
            "LENTILLE_LIST", "meeshy.flag.lentille_list",
            "READING_MODES", "meeshy.flag.reading_modes",
            "RIVIERE_MODE", "meeshy.flag.riviere_mode",
        )
    }
}
