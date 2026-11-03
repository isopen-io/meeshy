package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ComposerMediaPorterStoreTest {
    private fun media(uri: String) = ComposerLocalMedia(uri)

    private fun loaded(vararg uris: String): ComposerMediaPorterStore = ComposerMediaPorterStore().apply {
        update {
            it.copy(
                localMedia = uris.map(::media),
                roleByUri = uris.associateWith { ComposerMediaRole.FOREGROUND },
                slideIdByMediaUri = uris.associateWith { "s-$it" },
                objectIdBySource = uris.associateWith { "o-$it" },
                captions = uris.associateWith { "cap" },
                altsByObjectId = uris.associate { "o-$it" to "alt-$it" },
                railPosedUris = uris.toSet(),
            )
        }
    }

    private fun census(vararg pairs: Pair<String, String?>) =
        ComposerCanvasCensus(pairs.map { (id, file) -> ComposerCanvasObject(id, "slide", file) })

    @Test
    fun `retracting a media clears all eight carriers at once`() {
        val store = loaded("a", "b")
        val retraction = store.retract(listOf("o-a"), census = census("o-a" to "a", "o-b" to "b"))
        val p = store.porters.value
        assertThat(retraction.retiredUris).containsExactly("a")
        assertThat(p.localMedia.map { it.uri }).containsExactly("b")
        assertThat(p.roleByUri.keys).containsExactly("b")
        assertThat(p.slideIdByMediaUri.keys).containsExactly("b")
        assertThat(p.objectIdBySource.keys).containsExactly("b")
        assertThat(p.captions.keys).containsExactly("b")
        assertThat(p.altsByObjectId.keys).containsExactly("o-b")
        assertThat(p.railPosedUris).containsExactly("b")
    }

    @Test
    fun `a file still painted by a survivor stays in the load`() {
        val store = loaded("a")
        val retraction = store.retract(listOf("o-a"), census = census("o-a" to "a", "clone" to "a"))
        assertThat(retraction.retiredUris).isEmpty()
        assertThat(store.porters.value.localMedia.map { it.uri }).containsExactly("a")
    }

    @Test
    fun `the alternative text follows a surviving file to its new painter`() {
        val store = ComposerMediaPorterStore().apply {
            update { it.copy(localMedia = listOf(media("a")), objectIdBySource = mapOf("a" to "o1"), altsByObjectId = mapOf("o1" to "alt")) }
        }
        store.retract(listOf("o1"), census = census("o1" to "a", "o2" to "a"))
        assertThat(store.porters.value.objectIdBySource).containsExactly("a", "o2")
        assertThat(store.porters.value.altsByObjectId).containsExactly("o2", "alt")
    }

    @Test
    fun `retracting a slide takes all its objects and its founding media`() {
        val store = loaded("a", "b")
        val retraction = store.retract(emptyList(), slideId = "s-a", census = ComposerCanvasCensus(listOf(
            ComposerCanvasObject("o-a", "s-a", "a"), ComposerCanvasObject("t", "s-a"), ComposerCanvasObject("o-b", "s-b", "b"))))
        assertThat(retraction.retiredObjectIds).containsAtLeast("o-a", "t")
        assertThat(store.porters.value.localMedia.map { it.uri }).containsExactly("b")
    }

    @Test
    fun `a file named directly is retired even without an object`() {
        val store = loaded("a")
        store.retract(emptyList(), fileUris = setOf("a"))
        assertThat(store.porters.value.localMedia).isEmpty()
    }

    @Test
    fun `clear empties the store and an unchanged write keeps the same value`() {
        val store = loaded("a")
        store.clear()
        assertThat(store.porters.value).isEqualTo(ComposerMediaPorters.EMPTY)
        val before = store.porters.value
        store.update { it }
        assertThat(store.porters.value).isEqualTo(before)
    }

    @Test
    fun `alternative texts are re-keyed by source and blanks dropped`() {
        val p = ComposerMediaPorters(objectIdBySource = mapOf("a" to "o1", "b" to "o2"), altsByObjectId = mapOf("o1" to "x", "o2" to " "))
        assertThat(p.altsBySourceUri).containsExactly("a", "x")
    }
}
