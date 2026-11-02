package me.meeshy.sdk.sticker

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.sticker.StickerUsageEntry
import org.junit.Test

class StickerUsageStoreTest {
    private fun e(g: String) = StickerUsageEntry.emoji(g)

    @Test
    fun `poser met en tete des recents et le flux l'annonce`() {
        val store = StickerUsageStore(InMemoryStickerUsageStorage())
        store.noteUse(e("a"))
        store.noteUse(e("b"))
        store.noteUse(e("a"))
        assertThat(store.recents.value).containsExactly(e("a"), e("b")).inOrder()
    }

    @Test
    fun `l'epinglage se persiste, un nouveau magasin relit le meme stockage`() {
        val storage = InMemoryStickerUsageStorage()
        StickerUsageStore(storage).apply { adopt("u1"); toggleFavorite(e("a")); toggleFavorite(e("b")); noteUse(e("c")) }
        val reopened = StickerUsageStore(storage).apply { adopt("u1") }
        assertThat(reopened.favorites.value).containsExactly(e("b"), e("a")).inOrder()
        assertThat(reopened.recents.value).containsExactly(e("c"))
        assertThat(reopened.isFavorite(e("a"))).isTrue()
    }

    @Test
    fun `chaque compte a ses listes et le changement de compte recharge`() {
        val store = StickerUsageStore(InMemoryStickerUsageStorage())
        store.adopt("u1"); store.noteUse(e("a"))
        store.adopt("u2")
        assertThat(store.recents.value).isEmpty()
        store.noteUse(e("z"))
        store.adopt("u1")
        assertThat(store.recents.value).containsExactly(e("a"))
    }

    @Test
    fun `les listes d'avant reviennent au premier compte puis quittent les cles globales`() {
        val legacy = me.meeshy.sdk.model.sticker.StickerUsageLaw.encode(listOf(e("old")))
        val storage = InMemoryStickerUsageStorage(mapOf("meeshy.sticker.recents" to legacy))
        val store = StickerUsageStore(storage)
        store.adopt("u1")
        assertThat(store.recents.value).containsExactly(e("old"))
        assertThat(storage.read("meeshy.sticker.recents")).isNull()
        store.adopt("u2")
        assertThat(store.recents.value).isEmpty()
    }

    @Test
    fun `des preferences corrompues rendent une liste vide, pas une exception`() {
        val store = StickerUsageStore(InMemoryStickerUsageStorage(mapOf("meeshy.sticker.favorites" to "{pas du json")))
        assertThat(store.favorites.value).isEmpty()
    }
}
