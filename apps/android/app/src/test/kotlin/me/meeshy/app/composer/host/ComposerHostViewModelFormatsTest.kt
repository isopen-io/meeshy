package me.meeshy.app.composer.host

import androidx.lifecycle.SavedStateHandle
import com.google.common.truth.Truth.assertThat
import me.meeshy.app.composer.inbound.ComposerSeedStore
import me.meeshy.sdk.model.composer.ComposerFormat.POST
import me.meeshy.sdk.model.composer.ComposerFormat.STORY
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.io.File
import java.security.SecureRandom

/**
 * #13919 — l'hôte coche les formats au chevron de « Publier » : chaque toucher ajoute ou retire un format, jamais zéro, et
 * les formats d'un brouillon rouvert (ou ceux qu'un échec partiel laisse à republier) reviennent cochés.
 */
@RunWith(RobolectricTestRunner::class)
class ComposerHostViewModelFormatsTest {
    @get:Rule val folder = TemporaryFolder()

    private fun viewModel() = ComposerHostViewModel(
        SavedStateHandle(mapOf(ComposerHostRoute.ORIGIN_ARG to "feed")),
        ComposerSeedStore(File(folder.root, "inbound").also { it.mkdirs() }, System::currentTimeMillis, SecureRandom()),
    )

    @Test
    fun `a toggle checks a second format and a second toggle unchecks it`() {
        val vm = viewModel()

        vm.toggle(STORY)
        assertThat(vm.state.value.publishedFormats).containsExactly(POST, STORY).inOrder()

        vm.toggle(STORY)
        assertThat(vm.state.value.publishedFormats).containsExactly(POST)
    }

    @Test
    fun `the formats a draft or a partial failure hands back come back checked`() {
        val vm = viewModel()

        vm.restore(listOf(STORY, POST))
        assertThat(vm.state.value.publishedFormats).containsExactly(POST, STORY).inOrder()

        vm.restore(listOf(STORY))
        assertThat(vm.state.value.publishedFormats).containsExactly(STORY)
        assertThat(vm.state.value.selectedFormat).isEqualTo(STORY)
    }
}
