package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class PostServedRingAdapterTest {

    private fun served(origin: String?, contract: String? = null) =
        PostServedRing(pack = "aurora", item = "halo", origin = origin, contract = contract)

    @Test
    fun `un contour de post garde son pack, son item et son contrat`() {
        val item = served("official", "abcdef0123456789.json").toServedItem()

        assertThat(item.pack).isEqualTo("aurora")
        assertThat(item.item).isEqualTo("halo")
        assertThat(item.origin).isEqualTo(PackOrigin.OFFICIAL)
        assertThat(item.contract).isEqualTo("abcdef0123456789.json")
    }

    @Test
    fun `une origine absente ou inconnue se lit unknown sans erreur`() {
        assertThat(served(null).toServedItem().origin).isEqualTo(PackOrigin.UNKNOWN)
        assertThat(served("futur").toServedItem().origin).isEqualTo(PackOrigin.UNKNOWN)
    }
}
