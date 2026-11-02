package me.meeshy.app.composer.host

import androidx.lifecycle.SavedStateHandle
import com.google.common.truth.Truth.assertThat
import me.meeshy.app.composer.inbound.ComposerSeedStore
import me.meeshy.sdk.model.composer.ComposerTextSelection
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.io.File
import java.security.SecureRandom

@RunWith(RobolectricTestRunner::class)
class ComposerHostViewModelSelectionTest {
    @get:Rule val folder = TemporaryFolder()

    private fun viewModel() = ComposerHostViewModel(
        SavedStateHandle(mapOf(ComposerHostRoute.ORIGIN_ARG to "feed")),
        ComposerSeedStore(File(folder.root, "inbound").also { it.mkdirs() }, System::currentTimeMillis, SecureRandom()),
    )

    @Test
    fun `a fresh document has its caret at the end`() {
        assertThat(viewModel().selection).isEqualTo(ComposerTextSelection.AT_END)
    }

    @Test
    fun `the selection a surface reports is handed back to the next one that mounts`() {
        val vm = viewModel()
        vm.onSelection(ComposerTextSelection(3, 7))
        assertThat(vm.selection).isEqualTo(ComposerTextSelection(3, 7))
    }

    @Test
    fun `reporting a selection does not wake the host's state`() {
        val vm = viewModel()
        val before = vm.state.value
        vm.onSelection(ComposerTextSelection(1, 1))
        assertThat(vm.state.value).isSameInstanceAs(before)
    }

    @Test
    fun `the selection survives a format round trip`() {
        val vm = viewModel()
        vm.onSelection(ComposerTextSelection(2, 4))
        vm.choose(me.meeshy.sdk.model.composer.ComposerFormat.STORY)
        vm.choose(me.meeshy.sdk.model.composer.ComposerFormat.POST)
        assertThat(vm.selection).isEqualTo(ComposerTextSelection(2, 4))
    }
}
