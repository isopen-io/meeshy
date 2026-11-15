package me.meeshy.sdk.model.pack

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class PackDomainTest {
    @Test
    fun `les six domaines connus se lisent par leur segment d'adresse`() {
        assertThat(PackDomain.fromWire("sticker")).isEqualTo(PackDomain.STICKER)
        assertThat(PackDomain.fromWire("glory-frame")).isEqualTo(PackDomain.GLORY_FRAME)
        assertThat(PackDomain.fromWire("wallpaper")).isEqualTo(PackDomain.WALLPAPER)
        assertThat(PackDomain.fromWire("avatar-ring")).isEqualTo(PackDomain.AVATAR_RING)
        assertThat(PackDomain.fromWire("banner")).isEqualTo(PackDomain.BANNER)
        assertThat(PackDomain.fromWire("banner-frame")).isEqualTo(PackDomain.BANNER_FRAME)
    }

    @Test
    fun `un domaine futur ou absent est toleré et ne route rien`() {
        assertThat(PackDomain.fromWire("capture-frame")).isEqualTo(PackDomain.UNKNOWN)
        assertThat(PackDomain.fromWire(null)).isEqualTo(PackDomain.UNKNOWN)
        assertThat(PackDomain.fromWire("  ")).isEqualTo(PackDomain.UNKNOWN)
        assertThat(PackDomain.UNKNOWN.isRoutable).isFalse()
        assertThat(PackDomain.routable).doesNotContain(PackDomain.UNKNOWN)
    }

    @Test
    fun `seuls les domaines a registre payant offrent l'achat`() {
        assertThat(PackDomain.routable.filter { it.isPurchasable })
            .containsExactly(PackDomain.WALLPAPER, PackDomain.AVATAR_RING, PackDomain.BANNER, PackDomain.BANNER_FRAME)
        assertThat(PackDomain.STICKER.isPurchasable).isFalse()
        assertThat(PackDomain.GLORY_FRAME.isPurchasable).isFalse()
        assertThat(PackDomain.UNKNOWN.isPurchasable).isFalse()
    }

    @Test
    fun `le domaine d'un lien ignore l'absent, le blanc et l'inconnu`() {
        assertThat(PackDomain.ofQuery(" Wallpaper ")).isEqualTo(PackDomain.WALLPAPER)
        assertThat(PackDomain.ofQuery("lens")).isNull()
        assertThat(PackDomain.ofQuery(null)).isNull()
    }
}
