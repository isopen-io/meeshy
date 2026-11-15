package me.meeshy.app.navigation

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class PackShopRouteTest {

    @Test
    fun `the shop opens bare, on a domain, or on a pack of a domain`() {
        assertThat(Routes.packShop()).isEqualTo("settings/packs")
        assertThat(Routes.packShop(domain = "avatar-ring")).isEqualTo("settings/packs?domain=avatar-ring")
        assertThat(Routes.packShop(domain = "wallpaper", pack = "animes")).isEqualTo("settings/packs?domain=wallpaper&pack=animes")
        assertThat(Routes.packShop(pack = "animes")).isEqualTo("settings/packs?pack=animes")
    }

    @Test
    fun `a pack slug cannot break out of the query`() {
        assertThat(Routes.packShop(pack = "a&domain=banner")).isEqualTo("settings/packs?pack=a%26domain%3Dbanner")
    }
}
