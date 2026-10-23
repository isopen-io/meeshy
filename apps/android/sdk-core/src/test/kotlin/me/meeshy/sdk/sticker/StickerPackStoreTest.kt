package me.meeshy.sdk.sticker

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.sticker.StickerPackList
import me.meeshy.sdk.model.sticker.StickerPackSummary
import me.meeshy.sdk.net.api.StickerPackApi
import org.junit.Test

class StickerPackStoreTest {
    private class FakeApi(
        var installed: List<StickerPackSummary> = emptyList(),
        var failMutations: Boolean = false,
        var failList: Boolean = false,
    ) : StickerPackApi {
        override suspend fun installed(): ApiResponse<StickerPackList> =
            if (failList) throw java.io.IOException("offline") else ApiResponse(success = true, data = StickerPackList(installed))

        override suspend fun install(slug: String): ApiResponse<StickerPackSummary> =
            if (failMutations) ApiResponse(success = false, error = "no") else {
                installed = installed + StickerPackSummary(slug = slug, installed = true)
                ApiResponse(success = true, data = StickerPackSummary(slug = slug, installed = true))
            }

        override suspend fun uninstall(slug: String): ApiResponse<StickerPackSummary> =
            if (failMutations) ApiResponse(success = false, error = "no") else {
                installed = installed.filter { it.slug != slug }
                ApiResponse(success = true, data = StickerPackSummary(slug = slug))
            }
    }

    private fun pack(slug: String) = StickerPackSummary(slug = slug, installed = true)

    @Test
    fun `refresh publie les packs et l'ensemble installe`() = runTest {
        val store = StickerPackStore(FakeApi(installed = listOf(pack("fruits"))))
        assertThat(store.packs.value).isNull()
        store.refresh()
        assertThat(store.packs.value!!.map { it.slug }).containsExactly("fruits")
        assertThat(store.state.value.isInstalled("fruits")).isTrue()
    }

    @Test
    fun `une panne reseau n'efface jamais la liste connue`() = runTest {
        val api = FakeApi(installed = listOf(pack("fruits")))
        val store = StickerPackStore(api)
        store.refresh()
        api.failList = true
        store.refresh()
        assertThat(store.packs.value!!.map { it.slug }).containsExactly("fruits")
    }

    @Test
    fun `installer reussit, le pack reste installe et plus rien n'est en attente`() = runTest {
        val store = StickerPackStore(FakeApi())
        assertThat(store.setInstalled("fruits", install = true)).isTrue()
        assertThat(store.state.value.isInstalled("fruits")).isTrue()
        assertThat(store.state.value.isPending("fruits")).isFalse()
    }

    @Test
    fun `un refus du serveur restaure l'etat et signale le pack`() = runTest {
        val store = StickerPackStore(FakeApi(installed = listOf(pack("fruits")), failMutations = true))
        store.refresh()
        assertThat(store.setInstalled("fruits", install = false)).isFalse()
        assertThat(store.state.value.isInstalled("fruits")).isTrue()
        assertThat(store.state.value.failedSlug).isEqualTo("fruits")
    }

    @Test
    fun `retirer un pack le retire de la liste apres confirmation`() = runTest {
        val store = StickerPackStore(FakeApi(installed = listOf(pack("fruits"), pack("sport"))))
        store.refresh()
        assertThat(store.setInstalled("fruits", install = false)).isTrue()
        assertThat(store.packs.value!!.map { it.slug }).containsExactly("sport")
    }
}
