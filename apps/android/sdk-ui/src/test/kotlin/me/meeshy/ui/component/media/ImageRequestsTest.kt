package me.meeshy.ui.component.media

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import coil.request.CachePolicy
import coil.size.Dimension
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.runBlocking
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ImageRequestsTest {
    private val context: Context = ApplicationProvider.getApplicationContext()
    private val url = "https://gate.meeshy.me/a.jpg"

    @Test fun `la cle memoire porte le palier de taille, la cle disque reste l url`() {
        val request = ImageRequests.build(context, url, targetWidthPx = 360, allowNetwork = true)
        assertThat(request.memoryCacheKey?.key).isEqualTo("$url#w384")
        assertThat(request.diskCacheKey).isEqualTo(url)
    }

    @Test fun `deux tailles voisines partagent le meme palier`() {
        assertThat(ImageRequests.memoryKey(url, 361)).isEqualTo(ImageRequests.memoryKey(url, 380))
    }

    @Test fun `sans taille la cle est l url nue`() {
        assertThat(ImageRequests.memoryKey(url, null)).isEqualTo(url)
    }

    @Test fun `le decodage se fait a la largeur du palier et pas a 1200 px`() {
        val request = ImageRequests.build(context, url, targetWidthPx = 360, allowNetwork = true)
        val size = runBlocking { request.sizeResolver.size() }
        assertThat(size.width).isEqualTo(Dimension.Pixels(384))
        assertThat(size.height).isEqualTo(Dimension.Undefined)
    }

    @Test fun `reseau retenu desactive la politique reseau`() {
        assertThat(ImageRequests.build(context, url, 360, allowNetwork = false).networkCachePolicy).isEqualTo(CachePolicy.DISABLED)
        assertThat(ImageRequests.build(context, url, 360, allowNetwork = true).networkCachePolicy).isEqualTo(CachePolicy.ENABLED)
    }

    @Test fun `un essai different ou un nouveau jeton donne une requete differente`() {
        val base = ImageRequests.build(context, url, 360, true)
        assertThat(ImageRequests.build(context, url, 360, true, attempt = 1).parameters).isNotEqualTo(base.parameters)
        assertThat(ImageRequests.build(context, url, 360, true, reloadToken = "t2").parameters).isNotEqualTo(base.parameters)
    }
}
