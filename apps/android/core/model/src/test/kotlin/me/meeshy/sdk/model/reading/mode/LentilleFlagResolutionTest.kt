package me.meeshy.sdk.model.reading.mode

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class LentilleFlagResolutionTest {

    @Test
    fun `la surcharge de build l'emporte sur la valeur utilisateur dans les deux sens`() {
        assertThat(LentilleFlagResolution.resolve(buildOverride = false, userValue = true, default = true)).isFalse()
        assertThat(LentilleFlagResolution.resolve(buildOverride = true, userValue = false, default = false)).isTrue()
    }

    @Test
    fun `la valeur utilisateur l'emporte sur le défaut allumé dans les deux sens`() {
        assertThat(LentilleFlagResolution.resolve(null, userValue = false, default = true)).isFalse()
        assertThat(LentilleFlagResolution.resolve(null, userValue = true, default = false)).isTrue()
    }

    @Test
    fun `sans rien d'écrit les trois drapeaux sont allumés et la grammaire d'agent éteinte`() {
        val flags = LentilleFlagResolution.resolve()
        assertThat(flags.lentilleList).isTrue()
        assertThat(flags.readingModes).isTrue()
        assertThat(flags.riviereMode).isTrue()
        assertThat(flags.agentGrammar).isFalse()
    }

    @Test
    fun `une surcharge ne touche que son drapeau`() {
        val flags = LentilleFlagResolution.resolve(
            buildOverrides = mapOf(LentilleFeatureFlag.LENTILLE_LIST to false),
            userValues = mapOf(LentilleFeatureFlag.READING_MODES to false),
        )
        assertThat(flags.lentilleList).isFalse()
        assertThat(flags.readingModes).isFalse()
        assertThat(flags.riviereMode).isTrue()
    }

    @Test
    fun `la Rivière effective suit les modes de lecture sans toucher au choix stocké`() {
        val off = LentilleFeatureFlags().with(LentilleFeatureFlag.READING_MODES, false)
        assertThat(off.riviereMode).isTrue()
        assertThat(off.riviereEffective).isFalse()
        assertThat(off.with(LentilleFeatureFlag.READING_MODES, true).riviereEffective).isTrue()
    }

    @Test
    fun `la Rivière coupée reste coupée quand les modes sont allumés`() {
        assertThat(LentilleFeatureFlags(riviereMode = false).riviereEffective).isFalse()
    }
}
