package me.meeshy.app.composer.host

import androidx.lifecycle.SavedStateHandle
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.app.composer.inbound.ComposerSeedStore
import me.meeshy.app.composer.inbound.InboundMedia
import me.meeshy.sdk.model.composer.ComposerFormat
import me.meeshy.sdk.model.composer.InboundMediaKind
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.io.File
import java.security.SecureRandom

@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
class ComposerHostViewModelSeedTest {
    @get:Rule val folder = TemporaryFolder()

    @Before fun setUp() = Dispatchers.setMain(Dispatchers.Unconfined)

    @After fun tearDown() = Dispatchers.resetMain()

    private val store by lazy { ComposerSeedStore(File(folder.root, "inbound").also { it.mkdirs() }, System::currentTimeMillis, SecureRandom()) }
    private val jpeg = InboundMedia(byteArrayOf(0xFF.toByte(), 0xD8.toByte(), 0xFF.toByte(), 0xE0.toByte()) + ByteArray(40), InboundMediaKind.IMAGE, "image/jpeg", "jpg")

    private fun viewModel(vararg args: Pair<String, String>) = ComposerHostViewModel(SavedStateHandle(args.toMap()), store)

    @Test
    fun `the share door opens on the story scene and hands the received media to it once`() = runTest {
        val token = store.stash(listOf(jpeg))!!
        val vm = viewModel(ComposerHostRoute.ORIGIN_ARG to "share", ComposerHostRoute.SEED_ARG to token)
        val loaded = vm.seed.first { it !is SeedState.Loading }

        assertThat(vm.state.value.selectedFormat).isEqualTo(ComposerFormat.STORY)
        assertThat(vm.seededByDoor).isTrue()
        val ready = loaded as SeedState.Ready
        assertThat(ready.items.single().mimeType).isEqualTo("image/jpeg")

        vm.onSeedApplied()
        assertThat(vm.seed.value).isEqualTo(SeedState.None)
        assertThat(store.holds(token)).isFalse()
    }

    @Test
    fun `a share door whose seed is gone has nothing to compose`() = runTest {
        val vm = viewModel(ComposerHostRoute.ORIGIN_ARG to "share", ComposerHostRoute.SEED_ARG to "AbCdEfGhIjKlMnOpQrStUv")
        assertThat(vm.seed.first { it !is SeedState.Loading }).isEqualTo(SeedState.Lost)
    }

    @Test
    fun `a forged share door without a seed reads as the feed composer and posts nothing`() = runTest {
        val vm = viewModel(ComposerHostRoute.ORIGIN_ARG to "share")
        assertThat(vm.state.value.selectedFormat).isEqualTo(ComposerFormat.POST)
        assertThat(vm.seed.value).isEqualTo(SeedState.None)
        assertThat(vm.seededByDoor).isFalse()
    }

    @Test
    fun `the doors that start empty carry no seed, and a draft resumes its stored matter`() = runTest {
        assertThat(viewModel(ComposerHostRoute.ORIGIN_ARG to "story").seed.value).isEqualTo(SeedState.None)
        val draft = viewModel(ComposerHostRoute.ORIGIN_ARG to "draft", ComposerHostRoute.ID_ARG to "d1")
        assertThat(draft.state.value.selectedFormat).isEqualTo(ComposerFormat.STORY)
        assertThat(draft.seededByDoor).isFalse()
    }

    @Test
    fun `the media doors open on the story scene and keep a stored draft safe`() = runTest {
        val vm = viewModel(ComposerHostRoute.ORIGIN_ARG to "conversation-media", ComposerHostRoute.ID_ARG to "m1")
        assertThat(vm.state.value.selectedFormat).isEqualTo(ComposerFormat.STORY)
        assertThat(vm.seededByDoor).isTrue()
    }
}
