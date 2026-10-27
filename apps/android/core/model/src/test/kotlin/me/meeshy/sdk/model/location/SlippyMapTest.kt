package me.meeshy.sdk.model.location

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.SharedMapStyle
import org.junit.Test

class SlippyMapTest {
    @Test
    fun `le centre du monde tombe au milieu de la tuile centrale`() {
        val (x, y) = SlippyMap.worldPixel(GeoPoint(0.0, 0.0), zoom = 1)
        assertThat(x).isWithin(1e-6).of(256.0)
        assertThat(y).isWithin(1e-6).of(256.0)
    }

    @Test
    fun `worldPixel puis point se retrouvent`() {
        val paris = GeoPoint(48.8566, 2.3522)
        val (x, y) = SlippyMap.worldPixel(paris, 15)
        val back = SlippyMap.point(x, y, 15)
        assertThat(back.latitude).isWithin(1e-9).of(paris.latitude)
        assertThat(back.longitude).isWithin(1e-9).of(paris.longitude)
    }

    @Test
    fun `la tuile de Paris a zoom 10 est connue`() {
        val tiles = SlippyMap.tilesCovering(GeoPoint(48.8566, 2.3522), 10, 256, 256)
        assertThat(tiles.map { it.x to it.y }).contains(518 to 352)
    }

    @Test
    fun `une fenetre vide ne couvre aucune tuile`() {
        assertThat(SlippyMap.tilesCovering(GeoPoint(0.0, 0.0), 5, 0, 100)).isEmpty()
    }

    @Test
    fun `les tuiles couvrent toute la fenetre`() {
        val tiles = SlippyMap.tilesCovering(GeoPoint(10.0, 20.0), 12, 600, 400)
        assertThat(tiles.minOf { it.offsetX }).isAtMost(0)
        assertThat(tiles.minOf { it.offsetY }).isAtMost(0)
        assertThat(tiles.maxOf { it.offsetX + SlippyMap.TILE_SIZE }).isAtLeast(600)
        assertThat(tiles.maxOf { it.offsetY + SlippyMap.TILE_SIZE }).isAtLeast(400)
    }

    @Test
    fun `l'antimeridien enroule l'index de tuile`() {
        val tiles = SlippyMap.tilesCovering(GeoPoint(0.0, 179.99), 3, 512, 256)
        assertThat(tiles.all { it.x in 0..7 }).isTrue()
        assertThat(tiles.map { it.x }).contains(0)
    }

    @Test
    fun `aux poles aucune tuile hors du monde`() {
        val tiles = SlippyMap.tilesCovering(GeoPoint(89.0, 0.0), 4, 512, 512)
        assertThat(tiles.all { it.y in 0..15 }).isTrue()
    }

    @Test
    fun `glisser vers la droite recule le centre vers l'ouest`() {
        val centre = GeoPoint(10.0, 10.0)
        val moved = SlippyMap.panned(centre, dx = 100.0, dy = 0.0, zoom = 12)
        assertThat(moved.longitude).isLessThan(centre.longitude)
        assertThat(moved.latitude).isWithin(1e-9).of(centre.latitude)
    }

    @Test
    fun `glisser vers le bas recule le centre vers le nord`() {
        val centre = GeoPoint(10.0, 10.0)
        assertThat(SlippyMap.panned(centre, 0.0, 100.0, 12).latitude).isGreaterThan(centre.latitude)
    }

    @Test
    fun `l'URL de tuile est celle d'OpenStreetMap`() {
        assertThat(SlippyMap.tileUrl(1, 2, 3)).isEqualTo("https://tile.openstreetmap.org/3/1/2.png")
    }

    @Test
    fun `l'imagerie sert les tuiles Esri avec y avant x`() {
        assertThat(SlippyMap.tileUrl(1, 2, 3, SharedMapStyle.IMAGERY)).endsWith("/tile/3/2/1")
        assertThat(SlippyMap.tileUrl(1, 2, 3, SharedMapStyle.HYBRID)).isEqualTo(SlippyMap.tileUrl(1, 2, 3, SharedMapStyle.IMAGERY))
    }

    @Test
    fun `chaque fournisseur est credite`() {
        assertThat(SlippyMap.attribution(SharedMapStyle.STANDARD)).contains("OpenStreetMap")
        assertThat(SlippyMap.attribution(SharedMapStyle.IMAGERY)).contains("Esri")
    }

    @Test
    fun `une tuile logique de 128 un niveau plus haut couvre le meme monde`() {
        val paris = GeoPoint(48.8566, 2.3522)
        val (x256, y256) = SlippyMap.worldPixel(paris, 10, 256)
        val (x128, y128) = SlippyMap.worldPixel(paris, 11, 128)
        assertThat(x128).isWithin(1e-6).of(x256)
        assertThat(y128).isWithin(1e-6).of(y256)
    }

    @Test
    fun `le zoom est borne`() {
        assertThat(SlippyMap.clampZoom(99)).isEqualTo(SlippyMap.MAX_ZOOM)
        assertThat(SlippyMap.clampZoom(-3)).isEqualTo(SlippyMap.MIN_ZOOM)
    }
}
