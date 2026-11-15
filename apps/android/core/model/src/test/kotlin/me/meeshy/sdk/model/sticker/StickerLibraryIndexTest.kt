package me.meeshy.sdk.model.sticker

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StickerLibraryIndexTest {

    @Test
    fun `garder un sticker le met en tete des recents`() {
        val (index, evicted) = StickerLibraryIndex().saving("a", 10, budget = 100).first
            .saving("b", 10, budget = 100)
        assertThat(index.ids).containsExactly("b", "a").inOrder()
        assertThat(evicted).isEmpty()
    }

    @Test
    fun `regarder un id deja garde le remonte sans doublon`() {
        val index = StickerLibraryIndex(listOf(StickerLibraryEntry("b", 10), StickerLibraryEntry("a", 10)))
        val (next, _) = index.saving("a", 12, budget = 100)
        assertThat(next.ids).containsExactly("a", "b").inOrder()
        assertThat(next.totalBytes).isEqualTo(22)
    }

    @Test
    fun `au-dela du budget les plus anciens partent, jamais le plus recent`() {
        val index = StickerLibraryIndex(listOf(StickerLibraryEntry("c", 40), StickerLibraryEntry("b", 40), StickerLibraryEntry("a", 40)))
        val (next, evicted) = index.saving("d", 50, budget = 100)
        assertThat(next.ids).containsExactly("d", "c").inOrder()
        assertThat(evicted).containsExactly("a", "b").inOrder()
        val (alone, gone) = next.saving("huge", 500, budget = 100)
        assertThat(alone.ids).containsExactly("huge")
        assertThat(gone).containsExactly("c", "d").inOrder()
    }

    @Test
    fun `le budget produit est de 64 Mo`() {
        assertThat(StickerLibraryIndex.DEFAULT_BUDGET_BYTES).isEqualTo(64L * 1024 * 1024)
    }

    @Test
    fun `un id ne peut servir de nom de fichier que s'il ne sort pas du dossier`() {
        assertThat(StickerLibraryIndex.isFileSafe("2f1c-AB_9")).isTrue()
        assertThat(StickerLibraryIndex.isFileSafe("../x")).isFalse()
        assertThat(StickerLibraryIndex.isFileSafe("a/b")).isFalse()
        assertThat(StickerLibraryIndex.isFileSafe("")).isFalse()
        assertThat(StickerLibraryIndex.isFileSafe(".sticker-index.json")).isFalse()
    }

    @Test
    fun `retirer un id l'efface de l'index`() {
        val index = StickerLibraryIndex(listOf(StickerLibraryEntry("b", 10), StickerLibraryEntry("a", 10)))
        assertThat(index.removing("b").ids).containsExactly("a")
        assertThat(index.removing("zz")).isSameInstanceAs(index)
    }
}
