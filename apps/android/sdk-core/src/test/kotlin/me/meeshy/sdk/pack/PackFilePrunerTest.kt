package me.meeshy.sdk.pack

import com.google.common.truth.Truth.assertThat
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import me.meeshy.sdk.model.pack.PackFileManifest
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class PackFilePrunerTest {

    @get:Rule val folder = TemporaryFolder()

    private class Store : PackFilePruning {
        val pruned = mutableListOf<Set<String>>()
        override suspend fun prune(names: Set<String>): Set<String> = names.also { pruned += it }
    }

    private class Sources(var retained: Set<String>?, var frames: Set<String>? = emptySet()) : PackRetentionSources {
        override suspend fun retainedPacks() = retained
        override suspend fun referencedFrames() = frames
    }

    private fun index() = PackFileIndex(File(folder.root, "index.json"), Dispatchers.IO)

    @Test
    fun `removing a pack erases only files no retained pack of any account references`() = runBlocking<Unit> {
        val index = index().also {
            it.record(PackFileManifest("a", setOf("shared", "own-a")))
            it.record(PackFileManifest("b", setOf("shared", "own-b")))
        }
        val store = Store()
        val pruner = PackFilePruner(index, store, Sources(retained = setOf("b")))

        pruner.requestPrune()

        assertThat(store.pruned.single()).containsExactly("own-a")
        assertThat(index.all().map { it.slug }).containsExactly("b")
    }

    @Test
    fun `an unreadable shelf cancels the prune`() = runBlocking<Unit> {
        val index = index().also { it.record(PackFileManifest("a", setOf("f"))) }
        val store = Store()

        PackFilePruner(index, store, Sources(retained = null)).requestPrune()

        assertThat(store.pruned).isEmpty()
        assertThat(index.all()).hasSize(1)
    }

    @Test
    fun `an open lease defers the prune to its release`() = runBlocking<Unit> {
        val index = index().also { it.record(PackFileManifest("a", setOf("f"))) }
        val store = Store()
        val pruner = PackFilePruner(index, store, Sources(retained = emptySet()))

        pruner.acquireLease("a")
        pruner.requestPrune()
        assertThat(store.pruned).isEmpty()
        pruner.releaseLease("a")

        assertThat(store.pruned.single()).containsExactly("f")
    }

    @Test
    fun `a rerecorded pack leaves its dropped files unowned and they are pruned`() = runBlocking<Unit> {
        val index = index()
        index.record(PackFileManifest("a", setOf("old", "kept")))
        index.record(PackFileManifest("a", setOf("kept", "new")))
        val store = Store()

        PackFilePruner(index, store, Sources(retained = setOf("a"))).requestPrune()

        assertThat(store.pruned.single()).containsExactly("old")
        assertThat(index.all().map { it.slug }).containsExactly("a")
    }

    @Test
    fun `the index survives a restart`() = runBlocking<Unit> {
        index().record(PackFileManifest("a", setOf("f"), mapOf("frame" to setOf("t"))))

        val reread = index().all()

        assertThat(reread.single().frames).containsExactly("frame", setOf("t"))
    }
}
