package me.meeshy.app.settings

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.reading.mode.LentilleFeatureFlag
import me.meeshy.sdk.reading.InMemoryLentilleFeatureFlagsStore
import org.junit.Test

class InterfaceFeaturesViewModelTest {

    private val store = InMemoryLentilleFeatureFlagsStore()
    private val viewModel = InterfaceFeaturesViewModel(store)

    @Test
    fun `les trois interrupteurs sont actifs par défaut`() {
        assertThat(viewModel.flags.value.lentilleList).isTrue()
        assertThat(viewModel.flags.value.readingModes).isTrue()
        assertThat(viewModel.flags.value.riviereMode).isTrue()
    }

    @Test
    fun `couper les modes de lecture grise la Rivière sans effacer son choix`() {
        viewModel.setEnabled(LentilleFeatureFlag.READING_MODES, false)

        assertThat(viewModel.flags.value.isRiviereAdjustable).isFalse()
        assertThat(viewModel.flags.value.riviereMode).isTrue()
    }

    @Test
    fun `le choix de la liste Lentille n'affecte pas les modes de lecture`() {
        viewModel.setEnabled(LentilleFeatureFlag.LENTILLE_LIST, false)

        assertThat(viewModel.flags.value.lentilleList).isFalse()
        assertThat(viewModel.flags.value.readingModes).isTrue()
    }
}
