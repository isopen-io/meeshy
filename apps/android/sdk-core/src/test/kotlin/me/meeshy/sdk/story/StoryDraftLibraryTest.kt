package me.meeshy.sdk.story

import com.google.common.truth.Truth.assertThat
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.StoryComposerDraftSnapshot
import me.meeshy.sdk.model.StoryDraftIndex
import me.meeshy.sdk.model.StoryDraftSlideSnapshot
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class StoryDraftLibraryTest {

    @get:Rule
    val tmp = TemporaryFolder()

    private val json = Json { ignoreUnknownKeys = true }
    private var ids = 0

    private fun snap(text: String, id: String = "s-$text") = StoryComposerDraftSnapshot(
        slides = listOf(StoryDraftSlideSnapshot(id = id, text = text)),
        selectedId = id,
    )

    private class NoMedia : LegacyDraftMediaSource {
        override suspend fun copy(mediaId: String, directory: File): File? = null
    }

    private fun disk(root: File) = StoryDraftDiskStore(root, tmp.newFolder(), json)

    private fun library(
        store: StoryDraftStoring = disk(tmp.newFolder()),
        slot: StoryComposerDraftStore = InMemoryStoryComposerDraftStore(),
    ) = StoryDraftLibrary(store, slot, NoMedia(), tmp.newFolder(), clock = { 7_000L }, io = Dispatchers.Unconfined, newId = { "d${ids++}" })

    @Test
    fun `le brouillon unique d'avant est le premier de la liste et rien n'est perdu`() = runTest {
        val store = disk(tmp.newFolder())
        store.save("neuf", snap("neuf"), emptyMap())
        val library = library(store, InMemoryStoryComposerDraftStore(snap("ancien")))
        val listed = library.observe().first()
        assertThat(listed.map { it.id }).contains(StoryDraftIndex.SLOT_ID)
        assertThat(listed.map { it.id }).contains("neuf")
        assertThat(listed).hasSize(2)
    }

    @Test
    fun `un brouillon ecrit survit a la mort du processus`() = runTest {
        val root = tmp.newFolder()
        disk(root).save("a", snap("a"), emptyMap())
        val reborn = library(disk(root))
        assertThat(reborn.observe().first().single().id).isEqualTo("a")
    }

    @Test
    fun `supprimer retire le brouillon et l'emplacement se vide`() = runTest {
        val slot = InMemoryStoryComposerDraftStore(snap("ancien"))
        val store = disk(tmp.newFolder())
        store.save("a", snap("a"), emptyMap())
        val library = library(store, slot)
        assertThat(library.delete("a")).isTrue()
        assertThat(library.delete(StoryDraftIndex.SLOT_ID)).isTrue()
        assertThat(library.observe().first()).isEmpty()
        assertThat(slot.load()).isNull()
    }

    @Test
    fun `reprendre un brouillon met a l'abri celui de l'emplacement`() = runTest {
        val slot = InMemoryStoryComposerDraftStore(snap("en cours"))
        val store = disk(tmp.newFolder())
        store.save("a", snap("a"), emptyMap())
        val library = library(store, slot)
        assertThat(library.activate("a")).isTrue()
        assertThat(slot.load()).isEqualTo(snap("a"))
        val titles = library.observe().first().mapNotNull { it.title }
        assertThat(titles).containsExactly("a", "en cours")
    }

    @Test
    fun `un emplacement qui attend une publication n'est jamais ecrase`() = runTest {
        val waiting = snap("envoi").copy(awaitingPublication = listOf("cmid_1"))
        val slot = InMemoryStoryComposerDraftStore(waiting)
        val store = disk(tmp.newFolder())
        store.save("a", snap("a"), emptyMap())
        assertThat(library(store, slot).activate("a")).isFalse()
        assertThat(slot.load()).isEqualTo(waiting)
        assertThat(store.peek("a")).isNotNull()
    }

    @Test
    fun `reprendre un brouillon inconnu ne touche a rien`() = runTest {
        val slot = InMemoryStoryComposerDraftStore(snap("en cours"))
        assertThat(library(slot = slot).activate("absent")).isFalse()
        assertThat(slot.load()).isEqualTo(snap("en cours"))
    }
}
