package me.meeshy.sdk.post

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class CommentDraftStoreTest {

    private fun store(scope: TestScope, storage: InMemoryCommentDraftStorage = InMemoryCommentDraftStorage()) =
        CommentDraftStore(storage, scope, debounceMs = 400L)

    @Test
    fun `la frappe se relit tout de suite mais ne s ecrit qu apres 400 ms`() = runTest {
        val storage = InMemoryCommentDraftStorage()
        val drafts = store(this, storage)

        drafts.save("p1", "bon")
        drafts.save("p1", "bonjour")

        assertThat(drafts.load("p1")).isEqualTo("bonjour")
        advanceTimeBy(399)
        runCurrent()
        assertThat(storage.writes).isEqualTo(0)
        advanceTimeBy(2)
        runCurrent()
        assertThat(storage.writes).isEqualTo(1)
        assertThat(store(this, storage).load("p1")).isEqualTo("bonjour")
    }

    @Test
    fun `flush ecrit sans attendre`() = runTest {
        val storage = InMemoryCommentDraftStorage()
        val drafts = store(this, storage)

        drafts.save("p1", "a garder")
        drafts.flush()

        assertThat(storage.writes).isEqualTo(1)
        assertThat(store(this, storage).load("p1")).isEqualTo("a garder")
    }

    @Test
    fun `un texte vide efface immediatement`() = runTest {
        val storage = InMemoryCommentDraftStorage()
        val drafts = store(this, storage)
        drafts.save("p1", "x")
        drafts.flush()

        drafts.save("p1", "")

        assertThat(drafts.load("p1")).isNull()
        assertThat(storage.raw).isNull()
    }

    @Test
    fun `cinquante brouillons au plus le plus ancien part`() = runTest {
        val storage = InMemoryCommentDraftStorage()
        val drafts = store(this, storage)
        (1..51).forEach { drafts.save("p$it", "t$it") }
        drafts.flush()

        val reborn = store(this, storage)
        assertThat(reborn.load("p1")).isNull()
        assertThat(reborn.load("p2")).isEqualTo("t2")
        assertThat(reborn.load("p51")).isEqualTo("t51")
    }

    @Test
    fun `la deconnexion purge tout`() = runTest {
        val storage = InMemoryCommentDraftStorage()
        val drafts = store(this, storage)
        drafts.save("p1", "secret")
        drafts.flush()

        drafts.clear()

        assertThat(drafts.load("p1")).isNull()
        assertThat(storage.raw).isNull()
    }

    @Test
    fun `un support illisible donne un carnet vide`() = runTest {
        assertThat(store(this, InMemoryCommentDraftStorage("pas du json")).load("p1")).isNull()
    }
}
