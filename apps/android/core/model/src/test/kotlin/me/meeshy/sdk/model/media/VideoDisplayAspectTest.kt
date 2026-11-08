package me.meeshy.sdk.model.media

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class VideoDisplayAspectTest {

    @Test
    fun `l'asset gagne sur la vignette, la métadonnée et le repli`() {
        val ratio = VideoDisplayAspect.resolve(assetWidth = 1920, assetHeight = 1080, rotationDegrees = 0, thumbnailRatio = 1.0, metadataRatio = 2.0)
        assertThat(ratio).isWithin(1e-9).of(16.0 / 9.0)
    }

    @Test
    fun `une rotation de 90 ou 270 degres echange largeur et hauteur`() {
        assertThat(VideoDisplayAspect.resolve(1920, 1080, 90, null, null)).isWithin(1e-9).of(9.0 / 16.0)
        assertThat(VideoDisplayAspect.resolve(1920, 1080, 270, null, null)).isWithin(1e-9).of(9.0 / 16.0)
        assertThat(VideoDisplayAspect.resolve(1920, 1080, 180, null, null)).isWithin(1e-9).of(16.0 / 9.0)
    }

    @Test
    fun `sans asset la vignette gagne, puis la métadonnée, puis 16 sur 9`() {
        assertThat(VideoDisplayAspect.resolve(null, null, 0, 0.75, 2.0)).isEqualTo(0.75)
        assertThat(VideoDisplayAspect.resolve(null, null, 0, null, 1.5)).isEqualTo(1.5)
        assertThat(VideoDisplayAspect.resolve(null, null, 0, null, null)).isWithin(1e-9).of(16.0 / 9.0)
    }

    @Test
    fun `une valeur non positive ou non finie est ignorée`() {
        assertThat(VideoDisplayAspect.resolve(0, 0, 0, Double.NaN, -1.0)).isWithin(1e-9).of(16.0 / 9.0)
        assertThat(VideoDisplayAspect.resolve(null, null, 0, 0.0, 1.25)).isEqualTo(1.25)
    }

    @Test
    fun `le ratio de la bulle suit la source jusqu'a 9 sur 16 sans descendre plus bas`() {
        assertThat(VideoDisplayAspect.bubbleRatio(9.0 / 16.0)).isWithin(1e-9).of(9.0 / 16.0)
        assertThat(VideoDisplayAspect.bubbleRatio(0.3)).isWithin(1e-9).of(9.0 / 16.0)
        assertThat(VideoDisplayAspect.bubbleRatio(1.0)).isEqualTo(1.0)
    }

    @Test
    fun `le cache est indexé par url et évince les plus anciens`() {
        val cache = VideoDisplayAspectCache(capacity = 2)
        cache.store("a", 1.0)
        cache.store("b", 2.0)
        cache.store("c", 3.0)
        assertThat(cache.ratio("a")).isNull()
        assertThat(cache.ratio("b")).isEqualTo(2.0)
        assertThat(cache.ratio("c")).isEqualTo(3.0)
        assertThat(cache.size).isEqualTo(2)
    }

    @Test
    fun `relire n'évite pas l'éviction mais réécrire rafraîchit la valeur sans doubler`() {
        val cache = VideoDisplayAspectCache(capacity = 2)
        cache.store("a", 1.0)
        cache.store("b", 2.0)
        cache.ratio("a")
        cache.store("b", 5.0)
        cache.store("c", 3.0)
        assertThat(cache.ratio("a")).isNull()
        assertThat(cache.ratio("b")).isEqualTo(5.0)
    }

    @Test
    fun `la capacité par défaut est celle d'iOS`() {
        assertThat(VideoDisplayAspectCache.DEFAULT_CAPACITY).isEqualTo(2_000)
    }
}
