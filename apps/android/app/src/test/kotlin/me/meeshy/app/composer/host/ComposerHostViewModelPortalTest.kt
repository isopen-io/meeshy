package me.meeshy.app.composer.host

import androidx.lifecycle.SavedStateHandle
import com.google.common.truth.Truth.assertThat
import me.meeshy.app.composer.inbound.ComposerSeedStore
import me.meeshy.sdk.model.composer.ComposerFormat.POST
import me.meeshy.sdk.model.composer.ComposerFormat.STORY
import me.meeshy.sdk.model.composer.ComposerPortal
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.io.File
import java.security.SecureRandom

@RunWith(RobolectricTestRunner::class)
class ComposerHostViewModelPortalTest {
    @get:Rule val folder = TemporaryFolder()

    private fun viewModel(origin: String) = ComposerHostViewModel(
        SavedStateHandle(mapOf(ComposerHostRoute.ORIGIN_ARG to origin)),
        ComposerSeedStore(File(folder.root, "inbound").also { it.mkdirs() }, System::currentTimeMillis, SecureRandom()),
    )

    @Test
    fun `the story tray door opens on the story format`() {
        assertThat(viewModel("story").state.value.selectedFormat).isEqualTo(STORY)
        assertThat(viewModel("feed").state.value.selectedFormat).isEqualTo(POST)
    }

    @Test
    fun `switching the format keeps what was composed`() {
        val vm = viewModel("feed")
        vm.onMoodFacts("bonjour", null)
        vm.choose(STORY)
        assertThat(vm.state.value.text).isEqualTo("bonjour")
        vm.choose(POST)
        assertThat(vm.state.value.text).isEqualTo("bonjour")
    }

    @Test
    fun `only one portal is open at a time`() {
        val vm = viewModel("story")
        vm.present(ComposerPortal.STICKER)
        vm.present(ComposerPortal.SOUND)
        assertThat(vm.portal.value.open).isEqualTo(ComposerPortal.SOUND)
        vm.dismiss(ComposerPortal.STICKER)
        assertThat(vm.portal.value.open).isEqualTo(ComposerPortal.SOUND)
        vm.dismiss(ComposerPortal.SOUND)
        assertThat(vm.portal.value.open).isNull()
    }
}
