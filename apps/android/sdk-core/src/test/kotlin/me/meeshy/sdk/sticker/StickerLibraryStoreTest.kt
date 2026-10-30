package me.meeshy.sdk.sticker

import com.google.common.truth.Truth.assertThat
import java.io.File
import java.nio.file.Files
import kotlinx.coroutines.test.runTest
import org.junit.Test

class StickerLibraryStoreTest {
    private fun root(): File = Files.createTempDirectory("stickers").toFile()

    private fun store(root: File, budget: Long = 1_000, ids: Iterator<String> = generateSequence(1) { it + 1 }.map { "s$it" }.iterator()) =
        StickerLibraryStore(root, budgetBytes = budget, newId = { ids.next() })

    @Test
    fun `sans compte la bibliotheque est vide et ne garde rien`() = runTest {
        val library = store(root())
        assertThat(library.save(ByteArray(10))).isNull()
        assertThat(library.items.value).isEmpty()
    }

    @Test
    fun `garder des octets les met en tete et les rend lisibles`() = runTest {
        val library = store(root()).apply { adopt("u1") }
        val first = library.save(byteArrayOf(1, 2))!!
        val second = library.save(byteArrayOf(3))!!
        assertThat(library.items.value.map { it.id }).containsExactly(second.id, first.id).inOrder()
        assertThat(library.file(first.id)!!.readBytes()).isEqualTo(byteArrayOf(1, 2))
    }

    @Test
    fun `au-dela du budget le plus ancien est efface du disque`() = runTest {
        val library = store(root(), budget = 15).apply { adopt("u1") }
        val old = library.save(ByteArray(10))!!
        val fresh = library.save(ByteArray(10))!!
        assertThat(library.items.value.map { it.id }).containsExactly(fresh.id)
        assertThat(old.file.exists()).isFalse()
        assertThat(library.file(old.id)).isNull()
    }

    @Test
    fun `chaque compte a sa bibliotheque et la retrouve`() = runTest {
        val dir = root()
        val library = store(dir).apply { adopt("u1") }
        val mine = library.save(ByteArray(3))!!
        library.adopt("u2")
        assertThat(library.items.value).isEmpty()
        val reopened = store(dir).apply { adopt("u1") }
        assertThat(reopened.items.value.map { it.id }).containsExactly(mine.id)
    }

    @Test
    fun `vider le compte courant efface ses stickers sans toucher l'autre`() = runTest {
        val dir = root()
        val library = store(dir).apply { adopt("u1") }
        library.save(ByteArray(3))
        library.adopt("u2")
        val other = library.save(ByteArray(3))!!
        library.clear()
        assertThat(library.items.value).isEmpty()
        assertThat(other.file.exists()).isFalse()
        library.adopt("u1")
        assertThat(library.items.value).hasSize(1)
    }

    @Test
    fun `un index illisible repart d'une bibliotheque vide`() = runTest {
        val dir = root()
        val library = store(dir).apply { adopt("u1") }
        library.save(ByteArray(3))!!.file.parentFile!!.resolve(StickerLibraryStore.INDEX_FILE).writeText("{oops")
        assertThat(store(dir).apply { adopt("u1") }.items.value).isEmpty()
    }
}
