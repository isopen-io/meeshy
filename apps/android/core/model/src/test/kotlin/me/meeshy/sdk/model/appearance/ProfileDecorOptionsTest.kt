package me.meeshy.sdk.model.appearance

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.PackOrigin
import me.meeshy.sdk.model.ProfileDecorRef
import me.meeshy.sdk.model.ServedProfileDecorItem
import org.junit.Test

class ProfileDecorOptionsTest {

    private val catalog = AppearanceCatalog.decode(AppearanceFixtures.embeddedCatalogText())

    private fun summary(slug: String, installed: Boolean = true, owned: Boolean? = null, price: Int? = null) =
        InstalledPackSummary(slug = slug, installed = installed, owned = owned, price = price)

    @Test
    fun `before the installed list is read the default packs are offered`() {
        val slugs = ProfileDecorOptions.rings(null, catalog).map { it.pack }

        assertThat(slugs).containsAtLeast("contours-essentiels", "contours-animes")
        assertThat(slugs).doesNotContain("contours-celte")
    }

    @Test
    fun `an installed and owned pack is offered`() {
        val groups = ProfileDecorOptions.rings(listOf(summary("contours-celte")), catalog)

        assertThat(groups.map { it.pack }).containsExactly("contours-celte")
    }

    @Test
    fun `an installed but unpaid pack is not offered`() {
        val groups = ProfileDecorOptions.rings(listOf(summary("contours-celte", owned = false, price = 50)), catalog)

        assertThat(groups).isEmpty()
    }

    @Test
    fun `a pack that is not installed is not offered`() {
        assertThat(ProfileDecorOptions.banners(listOf(summary("bannieres-essentielles", installed = false)), catalog)).isEmpty()
    }

    @Test
    fun `flattened ids are unique across packs`() {
        val flat = ProfileDecorOptions.flattened(ProfileDecorOptions.rings(null, catalog))

        assertThat(flat.map { it.id }).containsNoDuplicates()
        assertThat(flat.first().ref.pack).isEqualTo("contours-essentiels")
    }

    private fun builtin(pack: String, item: String) = ServedProfileDecorItem(pack, item, PackOrigin.BUILTIN)

    @Test
    fun `a builtin ring resolves from the embedded catalog`() {
        assertThat(ProfileDecorResolver.ring(builtin("contours-essentiels", "filet"), catalog)?.key).isEqualTo("filet")
    }

    @Test
    fun `a contract-addressed item is not embedded and resolves to nothing`() {
        val item = ServedProfileDecorItem("contours-essentiels", "filet", PackOrigin.OFFICIAL, "abcdef0123456789.json")

        assertThat(ProfileDecorResolver.ring(item, catalog)).isNull()
    }

    @Test
    fun `a design banner wins over nothing and the photo wins over the design`() {
        val design = builtin("bannieres-essentielles", "aurore")

        assertThat(ProfileDecorResolver.bannerPaint(null, design, catalog)).isInstanceOf(ProfileBannerPaint.Design::class.java)
        assertThat(ProfileDecorResolver.bannerPaint("https://x/p.jpg", design, catalog))
            .isEqualTo(ProfileBannerPaint.Photo("https://x/p.jpg"))
        assertThat(ProfileDecorResolver.bannerPaint("", null, catalog)).isEqualTo(ProfileBannerPaint.Plain)
    }

    @Test
    fun `an unknown item resolves to nothing`() {
        assertThat(ProfileDecorResolver.bannerFrame(builtin("nope", "x"), catalog)).isNull()
        assertThat(ProfileDecorRef("a", "b").pack).isEqualTo("a")
    }
}
