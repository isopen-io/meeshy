package me.meeshy.sdk.model.profile

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.PackOrigin
import me.meeshy.sdk.model.ServedProfileDecor
import me.meeshy.sdk.model.ServedProfileDecorItem
import me.meeshy.sdk.model.appearance.AppearanceCatalog
import me.meeshy.sdk.model.appearance.AppearanceFixtures
import me.meeshy.sdk.model.appearance.ProfileBannerPaint
import org.junit.Test

class ProfileDecorLayersPolicyTest {

    private val catalog = AppearanceCatalog.decode(AppearanceFixtures.embeddedCatalogText())

    private fun item(pack: String, key: String) = ServedProfileDecorItem(pack, key, PackOrigin.BUILTIN)

    private fun equipped() = ServedProfileDecor(
        avatarRing = item("contours-essentiels", "filet"),
        banner = item("bannieres-essentielles", "aurore"),
        bannerFrame = item("cadres-haussmannien", FRAME_KEY),
    )

    @Test
    fun `the photo wins over the equipped design`() {
        val layers = ProfileDecorLayersPolicy.resolve("https://x/p.jpg", equipped(), catalog, blockedByTarget = false)

        assertThat(layers.banner).isEqualTo(ProfileBannerPaint.Photo("https://x/p.jpg"))
    }

    @Test
    fun `without a photo the equipped design paints and the frame sits on top`() {
        val layers = ProfileDecorLayersPolicy.resolve(null, equipped(), catalog, blockedByTarget = false)

        assertThat(layers.banner).isInstanceOf(ProfileBannerPaint.Design::class.java)
        assertThat(layers.frame?.key).isEqualTo(FRAME_KEY)
        assertThat(layers.ring?.key).isEqualTo("filet")
    }

    @Test
    fun `the frame never intercepts touches`() {
        val layers = ProfileDecorLayersPolicy.resolve(null, equipped(), catalog, blockedByTarget = false)

        assertThat(layers.intercepts).isFalse()
    }

    @Test
    fun `a target who blocked me shows no decor at all but keeps its photo`() {
        val layers = ProfileDecorLayersPolicy.resolve("https://x/p.jpg", equipped(), catalog, blockedByTarget = true)

        assertThat(layers.ring).isNull()
        assertThat(layers.frame).isNull()
        assertThat(layers.banner).isEqualTo(ProfileBannerPaint.Photo("https://x/p.jpg"))
        assertThat(ProfileDecorLayersPolicy.resolve(null, equipped(), catalog, blockedByTarget = true).banner)
            .isEqualTo(ProfileBannerPaint.Plain)
    }

    @Test
    fun `an empty decor keeps the historic rendering`() {
        val layers = ProfileDecorLayersPolicy.resolve(null, ServedProfileDecor.EMPTY, catalog, blockedByTarget = false)

        assertThat(layers.isHistoric).isTrue()
        assertThat(layers).isEqualTo(ProfileDecorLayers.NONE)
    }

    @Test
    fun `without the drawing engine the decor is historic and never crashes`() {
        val layers = ProfileDecorLayersPolicy.resolve(null, equipped(), catalog = null, blockedByTarget = false)

        assertThat(layers).isEqualTo(ProfileDecorLayers.NONE)
    }

    @Test
    fun `a side the catalog does not know is dropped alone`() {
        val decor = equipped().copy(bannerFrame = item("nope", "x"))
        val layers = ProfileDecorLayersPolicy.resolve(null, decor, catalog, blockedByTarget = false)

        assertThat(layers.frame).isNull()
        assertThat(layers.ring).isNotNull()
        assertThat(layers.isHistoric).isFalse()
    }

    private companion object {
        const val FRAME_KEY = "haussmannien"
    }
}
