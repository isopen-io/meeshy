package me.meeshy.app.composer.host

import androidx.lifecycle.SavedStateHandle
import com.google.common.truth.Truth.assertThat
import me.meeshy.app.composer.inbound.ComposerSeedStore
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.io.File
import java.security.SecureRandom

@RunWith(RobolectricTestRunner::class)
class ComposerHostViewModelOpeningTest {
    @get:Rule val folder = TemporaryFolder()

    private fun handle(origin: String?) = SavedStateHandle(listOfNotNull(origin?.let { ComposerHostRoute.ORIGIN_ARG to it }).toMap())

    private fun viewModel(origin: String?, saved: SavedStateHandle = handle(origin)) = ComposerHostViewModel(
        saved,
        ComposerSeedStore(File(folder.root, "inbound").also { it.mkdirs() }, System::currentTimeMillis, SecureRandom()),
    )

    @Test
    fun `the feed door owes the content field the keyboard until it has taken it`() {
        val vm = viewModel("feed")
        assertThat(vm.keyboardOwed.value).isTrue()
        vm.onKeyboardRaised()
        assertThat(vm.keyboardOwed.value).isFalse()
    }

    @Test
    fun `the story tray and the mood door raise no keyboard`() {
        assertThat(viewModel("story").keyboardOwed.value).isFalse()
        assertThat(viewModel("mood").keyboardOwed.value).isFalse()
    }

    @Test
    fun `a composer restored after process death does not raise the keyboard it already raised`() {
        val saved = handle("feed")
        viewModel("feed", saved).onKeyboardRaised()
        val restored = SavedStateHandle(saved.keys().associateWith { saved.get<Any>(it) })
        assertThat(viewModel("feed", restored).keyboardOwed.value).isFalse()
    }
}
