package me.meeshy.app.settings

import com.google.common.truth.Truth.assertThat
import java.io.File
import me.meeshy.sdk.model.ServedProfileDecor
import me.meeshy.sdk.model.ServedProfileDecorItem
import me.meeshy.sdk.model.appearance.AppearanceCatalog
import me.meeshy.sdk.model.appearance.AppearancePackDomain
import me.meeshy.sdk.model.packs.ShopPack
import org.junit.Test

class ShopBrowseRulesTest {

    private val catalog = AppearanceCatalog.decode(repositoryFile("sdk-core/src/main/assets/appearance-catalog.json").readText())

    // region Contenu d'un pack embarqué

    @Test fun `an embedded ring pack lists its rings, named in the reader language, ready to paint`() {
        val contents = EmbeddedShopContents.of(catalog, AppearancePackDomain.AVATAR_RING, "contours-essentiels", "fr")

        val ready = contents as ShopPackContents.Ready
        assertThat(ready.embedded).isTrue()
        assertThat(ready.items).hasSize(6)
        assertThat(ready.items.all { it.art is ShopItemArt.Ring && it.pack == "contours-essentiels" }).isTrue()
        assertThat(ready.items.first().name).isEqualTo(catalog.ringName(ready.items.first().key, "fr"))
    }

    @Test fun `each domain paints with its own art`() {
        fun art(domain: AppearancePackDomain, slug: String) =
            (EmbeddedShopContents.of(catalog, domain, slug, "en") as ShopPackContents.Ready).items.first().art

        assertThat(art(AppearancePackDomain.WALLPAPER, "essentiels")).isInstanceOf(ShopItemArt.Wallpaper::class.java)
        assertThat(art(AppearancePackDomain.BANNER, "bannieres-essentielles")).isInstanceOf(ShopItemArt.Banner::class.java)
        assertThat(art(AppearancePackDomain.BANNER_FRAME, "cadres-haussmannien")).isInstanceOf(ShopItemArt.BannerFrame::class.java)
    }

    @Test fun `an animated pack declares its animated items and weighs its films`() {
        val ready = EmbeddedShopContents.of(catalog, AppearancePackDomain.AVATAR_RING, "contours-animes", "en") as ShopPackContents.Ready

        assertThat(ready.items.any { it.art!!.animated }).isTrue()
        assertThat(ready.bytes!!).isGreaterThan(0L)
    }

    @Test fun `a pack the app does not carry is a drawn download state, never an empty list`() {
        val contents = EmbeddedShopContents.of(catalog, AppearancePackDomain.WALLPAPER, "pack-servi-inconnu", "fr")

        assertThat(contents).isEqualTo(ShopPackContents.DownloadRequired)
    }

    // endregion

    // region Pile de navigation

    @Test fun `the viewer opened from the detail goes back to the detail, then to the shop`() {
        val detail = ShopBrowseRoute.Detail(AppearancePackDomain.AVATAR_RING, "a")
        val viewer = ShopBrowseRoute.Viewer(AppearancePackDomain.AVATAR_RING, "a", 2)
        val stack = ShopBrowseStack().push(detail).push(viewer)

        assertThat(stack.top).isEqualTo(viewer)
        assertThat(stack.pop().top).isEqualTo(detail)
        assertThat(stack.pop().pop().isOpen).isFalse()
    }

    @Test fun `a proposal replaces the viewer, so back still returns where it was opened from`() {
        val detail = ShopBrowseRoute.Detail(AppearancePackDomain.BANNER, "a")
        val stack = ShopBrowseStack().push(detail).push(ShopBrowseRoute.Viewer(AppearancePackDomain.BANNER, "a", 0))
            .replaceTop(ShopBrowseRoute.Viewer(AppearancePackDomain.BANNER, "b", 1))

        assertThat(stack.routes).hasSize(2)
        assertThat(stack.pop().top).isEqualTo(detail)
    }

    @Test fun `opening the same route twice stacks it once`() {
        val detail = ShopBrowseRoute.Detail(AppearancePackDomain.BANNER, "a")

        assertThat(ShopBrowseStack().push(detail).push(detail).routes).hasSize(1)
    }

    // endregion

    // region Zoom

    @Test fun `pinching zooms between x1 and x4 and never beyond`() {
        val zoom = ShopItemZoom()

        assertThat(zoom.pinched(10f, 0f, 0f, 100f, 100f).scale).isEqualTo(ShopItemZoom.MAX)
        assertThat(zoom.pinched(0.1f, 0f, 0f, 100f, 100f).scale).isEqualTo(ShopItemZoom.MIN)
        assertThat(zoom.pinched(2.5f, 0f, 0f, 100f, 100f).scale).isEqualTo(2.5f)
    }

    @Test fun `the pager only scrolls while the item is at x1`() {
        assertThat(ShopItemZoom().pagerScrolls).isTrue()
        assertThat(ShopItemZoom().pinched(1.5f, 0f, 0f, 100f, 100f).pagerScrolls).isFalse()
        assertThat(ShopItemZoom(1.5f).pinched(0.5f, 0f, 0f, 100f, 100f).pagerScrolls).isTrue()
    }

    @Test fun `a double tap toggles between fit and x2 and recentres`() {
        val zoomed = ShopItemZoom().doubleTapped()
        assertThat(zoomed.scale).isEqualTo(ShopItemZoom.DOUBLE_TAP)

        val back = ShopItemZoom(3f, 40f, 20f).doubleTapped()
        assertThat(back).isEqualTo(ShopItemZoom())
    }

    @Test fun `panning stays inside the enlarged item`() {
        val zoom = ShopItemZoom(2f).pinched(1f, 500f, -500f, 100f, 200f)

        assertThat(zoom.offsetX).isEqualTo(50f)
        assertThat(zoom.offsetY).isEqualTo(-100f)
        assertThat(ShopItemZoom().pinched(1f, 30f, 30f, 100f, 100f).offsetX).isEqualTo(0f)
    }

    @Test fun `dragging down past the threshold closes the viewer`() {
        assertThat(ShopViewerDismiss.shouldDismiss(200f, 1000f)).isTrue()
        assertThat(ShopViewerDismiss.shouldDismiss(100f, 1000f)).isFalse()
        assertThat(ShopViewerDismiss.shouldDismiss(-300f, 1000f)).isFalse()
    }

    // endregion

    // region Position, autres propositions, équiper

    @Test fun `the position reads from one and stays inside the pack`() {
        assertThat(ShopBrowseRules.position(0, 5)).isEqualTo(1 to 5)
        assertThat(ShopBrowseRules.position(9, 5)).isEqualTo(5 to 5)
        assertThat(ShopBrowseRules.clampedIndex(3, 0)).isEqualTo(0)
    }

    @Test fun `other proposals come from the other packs of the domain, in shop order, bounded`() {
        val domain = AppearancePackDomain.AVATAR_RING
        val packs = listOf("contours-essentiels", "contours-animes", "cadres-illustres", "inconnu").map { ShopPack(slug = it) }
        val contents = packs.associate { it.slug to EmbeddedShopContents.of(catalog, domain, it.slug, "en") }

        val others = ShopBrowseRules.otherProposals(packs, "contours-essentiels", contents, limit = 5)

        assertThat(others).hasSize(5)
        assertThat(others.none { it.pack == "contours-essentiels" }).isTrue()
        assertThat(others.first().pack).isEqualTo("contours-animes")
    }

    private val ring = ShopItem(AppearancePackDomain.AVATAR_RING, "p", "k", "K", art = null)
        .copy(art = (EmbeddedShopContents.of(catalog, AppearancePackDomain.AVATAR_RING, "contours-essentiels", "en") as ShopPackContents.Ready).items.first().art)

    @Test fun `an installed pack offers to equip, an equipped item says so`() {
        val pack = ShopPack(slug = "p", installed = true)
        assertThat(ShopBrowseRules.offer(ring, pack, ServedProfileDecor.EMPTY)).isEqualTo(ShopEquipOffer.Equip)

        val equipped = ServedProfileDecor(avatarRing = ServedProfileDecorItem("p", "k"))
        assertThat(ShopBrowseRules.offer(ring, pack, equipped)).isEqualTo(ShopEquipOffer.Equipped)
    }

    @Test fun `an owned pack not installed asks to install first, a paid or locked one offers nothing`() {
        assertThat(ShopBrowseRules.offer(ring, ShopPack(slug = "p"), ServedProfileDecor.EMPTY)).isEqualTo(ShopEquipOffer.InstallFirst)
        assertThat(ShopBrowseRules.offer(ring, ShopPack(slug = "p", price = 30, owned = false), ServedProfileDecor.EMPTY))
            .isEqualTo(ShopEquipOffer.Unavailable)
        assertThat(ShopBrowseRules.offer(ring.copy(art = null), ShopPack(slug = "p", installed = true), ServedProfileDecor.EMPTY))
            .isEqualTo(ShopEquipOffer.Unavailable)
    }

    @Test fun `a wallpaper is chosen per conversation, the shop imposes it on none`() {
        val wallpaper = ring.copy(domain = AppearancePackDomain.WALLPAPER)

        assertThat(ShopBrowseRules.offer(wallpaper, ShopPack(slug = "p", installed = true), ServedProfileDecor.EMPTY))
            .isEqualTo(ShopEquipOffer.PerConversation)
    }

    @Test fun `a pack reads installed, else embedded in the app, else to download`() {
        val embedded = EmbeddedShopContents.of(catalog, AppearancePackDomain.WALLPAPER, "heritages", "fr")

        assertThat(ShopBrowseRules.packState(ShopPack(slug = "heritages", installed = true), embedded)).isEqualTo(ShopPackState.INSTALLED)
        assertThat(ShopBrowseRules.packState(ShopPack(slug = "heritages"), embedded)).isEqualTo(ShopPackState.EMBEDDED)
        assertThat(ShopBrowseRules.packState(ShopPack(slug = "x"), ShopPackContents.DownloadRequired)).isEqualTo(ShopPackState.TO_DOWNLOAD)
        assertThat(ShopBrowseRules.packState(ShopPack(slug = "x"), null)).isEqualTo(ShopPackState.TO_DOWNLOAD)
    }

    // endregion

    private fun repositoryFile(relative: String): File {
        val candidates = generateSequence(File(".").absoluteFile) { it.parentFile }.take(8).flatMap {
            sequenceOf(File(it, relative), File(it, "apps/android/$relative"))
        }
        return checkNotNull(candidates.firstOrNull { it.exists() }) { "$relative introuvable depuis ${File(".").absolutePath}" }
    }
}
