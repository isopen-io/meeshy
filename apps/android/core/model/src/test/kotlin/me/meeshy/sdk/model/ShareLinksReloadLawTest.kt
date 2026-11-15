package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ShareLinksReloadLawTest {

    private fun link(id: String) = MyShareLink(id = id, linkId = id)

    @Test
    fun `visite avec cache frais ne demande aucun appel`() {
        assertThat(ShareLinksReloadLaw.mustFetch(ShareLinksReloadTrigger.Appear, cacheIsFresh = true)).isFalse()
    }

    @Test
    fun `visite avec cache perime ou vide demande le serveur`() {
        assertThat(ShareLinksReloadLaw.mustFetch(ShareLinksReloadTrigger.Appear, cacheIsFresh = false)).isTrue()
    }

    @Test
    fun `tirer pour rafraichir et retour de creation exigent le serveur meme sur cache frais`() {
        assertThat(ShareLinksReloadLaw.mustFetch(ShareLinksReloadTrigger.PullToRefresh, cacheIsFresh = true)).isTrue()
        assertThat(ShareLinksReloadLaw.mustFetch(ShareLinksReloadTrigger.LinkCreated, cacheIsFresh = true)).isTrue()
    }

    @Test
    fun `un echec de lecture garde la liste precedente`() {
        val current = listOf(link("a"), link("b"))
        assertThat(ShareLinksReloadLaw.linksAfterFetch(current, fetched = null)).isEqualTo(current)
    }

    @Test
    fun `une lecture reussie remplace la liste meme vide`() {
        val current = listOf(link("a"))
        assertThat(ShareLinksReloadLaw.linksAfterFetch(current, fetched = emptyList())).isEmpty()
        assertThat(ShareLinksReloadLaw.linksAfterFetch(current, fetched = listOf(link("z")))).containsExactly(link("z"))
    }
}
