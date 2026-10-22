package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.sticker.StickerPackState
import me.meeshy.sdk.model.sticker.StickerSheetChoice
import me.meeshy.sdk.model.sticker.StickerUsageEntry
import org.junit.Test

class StickerSheetPageModelTest {
    private fun fixed(tab: StickerSheetTab) = StickerSheetPage.Fixed(tab)
    private fun pack(slug: String, items: Int = 3) = StickerPackInfo(slug, slug.uppercase(), items)

    @Test
    fun `sans capacite il reste les cinq onglets fixes dans l'ordre`() {
        val pages = StickerSheetPageModel.offered(hasMee = false, installed = null, hasPackPick = false, hasShop = false)
        assertThat(pages).containsExactly(
            fixed(StickerSheetTab.SEARCH), fixed(StickerSheetTab.FAVORITES), fixed(StickerSheetTab.RECENTS),
            fixed(StickerSheetTab.CUSTOM), fixed(StickerSheetTab.SMILEYS),
        ).inOrder()
    }

    @Test
    fun `les packs integres sont installes par defaut tant qu'on ne sait pas, puis les packs de tiers, puis la boutique en fin`() {
        val pages = StickerSheetPageModel.offered(true, null, hasPackPick = true, hasShop = true)
        assertThat(pages.filterIsInstance<StickerSheetPage.Pack>().map { it.slug })
            .containsExactly("mee", "meo", "mee-et-meo").inOrder()
        assertThat(pages.last()).isEqualTo(StickerSheetPage.Shop)
    }

    @Test
    fun `un pack integre desinstalle perd son onglet, un pack de tiers vide n'en a pas`() {
        val pages = StickerSheetPageModel.offered(
            true, listOf(pack("meo"), pack("fruits"), pack("vide", 0)), hasPackPick = true, hasShop = false,
        )
        assertThat(pages.filterIsInstance<StickerSheetPage.Pack>().map { it.slug })
            .containsExactly("meo", "fruits").inOrder()
        assertThat(pages).doesNotContain(StickerSheetPage.Shop)
    }

    @Test
    fun `les packs de tiers n'ont pas d'onglet sans capacite de pose`() {
        val pages = StickerSheetPageModel.offered(false, listOf(pack("fruits")), hasPackPick = false, hasShop = false)
        assertThat(pages.any { it.isPack }).isFalse()
    }

    @Test
    fun `une page disparue retombe sur la premiere`() {
        val pages = StickerSheetPageModel.offered(true, null, false, false)
        assertThat(StickerSheetPageModel.resolved(StickerSheetPage.Pack("fruits"), pages)).isEqualTo(pages.first())
        assertThat(StickerSheetPageModel.resolved(StickerSheetPage.Pack("meo"), pages)).isEqualTo(StickerSheetPage.Pack("meo"))
    }

    @Test
    fun `la capsule defile au dela de six entrees`() {
        assertThat(StickerSheetPageModel.tabBarScrolls(6)).isFalse()
        assertThat(StickerSheetPageModel.tabBarScrolls(7)).isTrue()
    }

    @Test
    fun `la recherche par titre ignore casse et accents`() {
        val titles = listOf("École", "Fruits", "Été")
        assertThat(StickerSheetPageModel.filterByTitle(titles, "ECOLE") { it }).containsExactly("École")
        assertThat(StickerSheetPageModel.filterByTitle(titles, "ete") { it }).containsExactly("Été")
        assertThat(StickerSheetPageModel.filterByTitle(titles, "  ", { it })).hasSize(3)
        assertThat(StickerSheetPageModel.filterByTitle(titles, "zzz") { it }).isEmpty()
    }

    @Test
    fun `les identifiants de page sont stables`() {
        assertThat(fixed(StickerSheetTab.RECENTS).id).isEqualTo("tab.recents")
        assertThat(StickerSheetPage.Pack("meo").id).isEqualTo("pack.meo")
        assertThat(StickerSheetPage.Shop.id).isEqualTo("shop")
    }

    @Test
    fun `le choix retient son entree d'usage, sauf instants et packs de tiers`() {
        assertThat(StickerSheetChoice.Emoji("😀").usageEntry).isEqualTo(StickerUsageEntry.emoji("😀"))
        assertThat(StickerSheetChoice.Mee("m").usageEntry).isEqualTo(StickerUsageEntry.mee("m"))
        assertThat(StickerSheetChoice.Instant("i").usageEntry).isNull()
        assertThat(StickerSheetChoice.PackItem("p", "x").usageEntry).isNull()
    }
}

class StickerPackStateTest {
    @Test
    fun `installer bascule tout de suite et marque en attente`() {
        val s = StickerPackState().begin("fruits")
        assertThat(s.isInstalled("fruits")).isTrue()
        assertThat(s.isPending("fruits")).isTrue()
    }

    @Test
    fun `l'echec restaure l'etat d'avant et signale le pack`() {
        val s = StickerPackState(installed = setOf("fruits")).begin("fruits").rollback("fruits")
        assertThat(s.isInstalled("fruits")).isTrue()
        assertThat(s.isPending("fruits")).isFalse()
        assertThat(s.failedSlug).isEqualTo("fruits")
    }

    @Test
    fun `l'echec d'une installation la retire`() {
        val s = StickerPackState().begin("fruits").rollback("fruits")
        assertThat(s.isInstalled("fruits")).isFalse()
    }

    @Test
    fun `la confirmation garde le basculement et un geste en attente est inerte`() {
        val begun = StickerPackState().begin("a")
        assertThat(begun.begin("a")).isSameInstanceAs(begun)
        val settled = begun.settle("a")
        assertThat(settled.isInstalled("a")).isTrue()
        assertThat(settled.isPending("a")).isFalse()
    }
}
