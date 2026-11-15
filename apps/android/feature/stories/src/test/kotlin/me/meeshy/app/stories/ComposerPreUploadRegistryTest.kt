package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.composer.ComposerPreUploadState
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ComposerPreUploadRegistryTest {

    private class Harness(scope: TestScope) {
        val gates = mutableMapOf<String, CompletableDeferred<PreUploadedAsset?>>()
        val started = mutableListOf<String>()
        var adoptResult = true
        val adopted = mutableListOf<String>()
        val registry = ComposerPreUploadRegistry(
            scope = scope.backgroundScope,
            uploader = { path, _, onProgress ->
                started += path
                onProgress(50, 100)
                gates.getOrPut(path) { CompletableDeferred() }.await()
            },
            adopt = { path, _ -> adopted += path; adoptResult },
        )
        fun finish(path: String, asset: PreUploadedAsset? = PreUploadedAsset("pm-$path", "https://cdn/$path")) {
            gates.getOrPut(path) { CompletableDeferred() }.complete(asset)
        }
    }

    private fun TestScope.harness() = Harness(this)

    @Test
    fun `un fichier minuscule ou deja distant ne part pas`() = runTest(UnconfinedTestDispatcher()) {
        val h = harness()
        h.registry.begin("/a", "image/jpeg", 1_000, alreadyRemote = false)
        h.registry.begin("/b", "image/jpeg", 10_000_000, alreadyRemote = true)
        assertThat(h.started).isEmpty()
        assertThat(h.registry.state("/a")).isEqualTo(ComposerPreUploadState.Idle)
    }

    @Test
    fun `la montee affiche sa progression puis PRET apres adoption`() = runTest(UnconfinedTestDispatcher()) {
        val h = harness()
        h.registry.begin("/a", "image/jpeg", 200_000, alreadyRemote = false)
        assertThat(h.registry.state("/a")).isEqualTo(ComposerPreUploadState.Uploading(50, 100))
        h.finish("/a")
        assertThat(h.registry.state("/a")).isEqualTo(ComposerPreUploadState.Ready("pm-/a", "https://cdn//a"))
        assertThat(h.adopted).containsExactly("/a")
    }

    @Test
    fun `deux montees au plus, FIFO`() = runTest(UnconfinedTestDispatcher()) {
        val h = harness()
        listOf("/1", "/2", "/3").forEach { h.registry.begin(it, "image/jpeg", 200_000, false) }
        assertThat(h.started).containsExactly("/1", "/2").inOrder()
        h.finish("/1")
        assertThat(h.started).containsExactly("/1", "/2", "/3").inOrder()
    }

    @Test
    fun `un echec devient Failed sans rien lever et libere la file`() = runTest(UnconfinedTestDispatcher()) {
        val h = harness()
        h.registry.begin("/a", "image/jpeg", 200_000, false)
        h.finish("/a", null)
        assertThat(h.registry.state("/a")).isEqualTo(ComposerPreUploadState.Failed)
        assertThat(h.adopted).isEmpty()
    }

    @Test
    fun `un objet retire pendant la montee est oublie`() = runTest(UnconfinedTestDispatcher()) {
        val h = harness()
        h.adoptResult = false
        h.registry.begin("/a", "image/jpeg", 200_000, false)
        h.finish("/a")
        assertThat(h.registry.state("/a")).isEqualTo(ComposerPreUploadState.Idle)
    }

    @Test
    fun `forget annule et oublie`() = runTest(UnconfinedTestDispatcher()) {
        val h = harness()
        h.registry.begin("/a", "image/jpeg", 200_000, false)
        h.registry.forget("/a")
        h.finish("/a")
        assertThat(h.registry.state("/a")).isEqualTo(ComposerPreUploadState.Idle)
        assertThat(h.adopted).isEmpty()
    }

    @Test
    fun `stopForPublication arrete les montees en cours et garde les pretes`() = runTest(UnconfinedTestDispatcher()) {
        val h = harness()
        h.registry.begin("/a", "image/jpeg", 200_000, false)
        h.finish("/a")
        h.registry.begin("/b", "image/jpeg", 200_000, false)
        h.registry.begin("/c", "image/jpeg", 200_000, false)
        h.registry.stopForPublication()
        assertThat(h.registry.state("/a").isReady).isTrue()
        assertThat(h.registry.state("/b")).isEqualTo(ComposerPreUploadState.Idle)
        assertThat(h.registry.state("/c")).isEqualTo(ComposerPreUploadState.Idle)
    }
}
