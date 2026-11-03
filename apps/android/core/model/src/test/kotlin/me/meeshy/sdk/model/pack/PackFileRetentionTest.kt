package me.meeshy.sdk.model.pack

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class PackFileRetentionTest {

    private fun manifest(slug: String, files: Set<String>, frames: Map<String, Set<String>> = emptyMap()) =
        PackFileManifest(slug, files, frames)

    @Test
    fun `removing a pack erases its files`() {
        val plan = PackFileRetention.plan(listOf(manifest("a", setOf("f1", "f2"))), retainedPacks = emptySet(), referencedFrames = emptySet())

        assertThat(plan.files).containsExactly("f1", "f2")
        assertThat(plan.forgottenPacks).containsExactly("a")
    }

    @Test
    fun `a file shared with a retained pack of any account stays`() {
        val plan = PackFileRetention.plan(
            listOf(manifest("a", setOf("shared", "own-a")), manifest("b", setOf("shared", "own-b"))),
            retainedPacks = setOf("b"),
            referencedFrames = emptySet(),
        )

        assertThat(plan.files).containsExactly("own-a")
        assertThat(plan.forgottenPacks).containsExactly("a")
    }

    @Test
    fun `a frame kept in a notebook keeps its files and the pack common files`() {
        val plan = PackFileRetention.plan(
            listOf(manifest("a", setOf("common"), mapOf("f1" to setOf("thumb1"), "f2" to setOf("thumb2")))),
            retainedPacks = emptySet(),
            referencedFrames = setOf("f1"),
        )

        assertThat(plan.files).containsExactly("thumb2")
        assertThat(plan.forgottenPacks).isEmpty()
    }

    @Test
    fun `a retained pack keeps every frame`() {
        val plan = PackFileRetention.plan(
            listOf(manifest("a", setOf("c"), mapOf("f1" to setOf("t")))), setOf("a"), emptySet(),
        )

        assertThat(plan.files).isEmpty()
        assertThat(plan.forgottenPacks).isEmpty()
    }

    @Test
    fun `a file no manifest describes is never in the plan`() {
        val plan = PackFileRetention.plan(listOf(manifest("a", setOf("known"))), emptySet(), emptySet())

        assertThat(plan.files).doesNotContain("unknown")
    }

    @Test
    fun `a lease holds the pack through the retained set`() {
        val plan = PackFileRetention.plan(listOf(manifest("a", setOf("f"))), retainedPacks = setOf("a"), referencedFrames = emptySet())

        assertThat(plan.files).isEmpty()
    }
}
