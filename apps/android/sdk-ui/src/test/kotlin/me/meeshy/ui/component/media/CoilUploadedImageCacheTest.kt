package me.meeshy.ui.component.media

import android.content.Context
import android.graphics.Bitmap
import android.os.Looper
import androidx.test.core.app.ApplicationProvider
import coil.ImageLoader
import coil.annotation.ExperimentalCoilApi
import coil.decode.DataSource
import coil.disk.DiskCache
import coil.request.CachePolicy
import coil.request.ErrorResult
import coil.request.ImageRequest
import coil.request.ImageResult
import coil.request.SuccessResult
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.async
import me.meeshy.sdk.model.mediacache.MediaCacheCategory
import okhttp3.OkHttpClient
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.GraphicsMode
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.io.InputStream
import java.nio.file.Files
import java.util.UUID

@OptIn(ExperimentalCoilApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class CoilUploadedImageCacheTest {
    private val context: Context = ApplicationProvider.getApplicationContext()

    /** Le chargeur de l'app, sans mémoire et avec un réseau qui refuse tout : une image qui revient vient du disque. */
    private val loader: ImageLoader = ImageLoader.Builder(context)
        .memoryCache(null)
        .diskCache { DiskCache.Builder().directory(Files.createTempDirectory("image_cache").toFile()).build() }
        .okHttpClient { OkHttpClient.Builder().addInterceptor { throw IOException("aucun réseau en test") }.build() }
        .build()

    private val cache = CoilUploadedImageCache { loader }

    private fun url() = "https://gate.meeshy.me/api/v1/attachments/file/2026/10/${UUID.randomUUID()}/photo.png"

    private fun png(): ByteArray = ByteArrayOutputStream().also { out ->
        Bitmap.createBitmap(6, 4, Bitmap.Config.ARGB_8888).compress(Bitmap.CompressFormat.PNG, 100, out)
    }.toByteArray()

    /** Coil reprend sur le fil principal : le test le fait tourner jusqu'à la réponse, sans le bloquer. */
    @OptIn(ExperimentalCoroutinesApi::class)
    private fun loadOffline(url: String): ImageResult {
        val request = ImageRequest.Builder(context).data(url).memoryCachePolicy(CachePolicy.DISABLED).build()
        val result = MainScope().async { loader.execute(request) }
        val deadline = System.currentTimeMillis() + LOAD_TIMEOUT_MILLIS
        while (!result.isCompleted && System.currentTimeMillis() < deadline) {
            shadowOf(Looper.getMainLooper()).idle()
            Thread.sleep(5)
        }
        return result.getCompleted()
    }

    private fun stored(url: String): ByteArray? = loader.diskCache!!.openSnapshot(url)?.use { snapshot ->
        loader.diskCache!!.fileSystem.read(snapshot.data) { readByteArray() }
    }

    @Test
    fun `une image envoyee se relit depuis le disque avec un reseau qui refuse`() {
        val url = url()
        val image = png()

        assertThat(cache.adopt(MediaCacheCategory.IMAGES, url, image.size.toLong()) { image.inputStream() }).isTrue()

        val result = loadOffline(url)
        assertThat(result).isInstanceOf(SuccessResult::class.java)
        assertThat((result as SuccessResult).dataSource).isEqualTo(DataSource.DISK)
        assertThat(stored(url)).isEqualTo(image)
    }

    @Test
    fun `une image jamais envoyee ne se relit pas sans reseau`() {
        assertThat(loadOffline(url())).isInstanceOf(ErrorResult::class.java)
    }

    @Test
    fun `une source trop courte n adopte rien et ne laisse aucune entree`() {
        val url = url()
        val image = png()

        assertThat(cache.adopt(MediaCacheCategory.IMAGES, url, image.size + 10L) { image.inputStream() }).isFalse()

        assertThat(stored(url)).isNull()
        assertThat(loadOffline(url)).isInstanceOf(ErrorResult::class.java)
    }

    @Test
    fun `une source plus longue que la taille annoncee n adopte rien`() {
        val url = url()
        val image = png()

        assertThat(cache.adopt(MediaCacheCategory.IMAGES, url, image.size - 1L) { image.inputStream() }).isFalse()

        assertThat(stored(url)).isNull()
    }

    @Test
    fun `une lecture qui echoue n adopte rien et laisse la place a une adoption suivante`() {
        val url = url()
        val image = png()
        val failing = object : InputStream() {
            override fun read(): Int = throw IOException("fichier disparu")
        }

        assertThat(cache.adopt(MediaCacheCategory.IMAGES, url, image.size.toLong()) { failing }).isFalse()
        assertThat(stored(url)).isNull()

        assertThat(cache.adopt(MediaCacheCategory.IMAGES, url, image.size.toLong()) { image.inputStream() }).isTrue()
        assertThat(stored(url)).isEqualTo(image)
    }

    @Test
    fun `une image deja en cache n est ni relue ni remplacee`() {
        val url = url()
        val image = png()
        cache.adopt(MediaCacheCategory.IMAGES, url, image.size.toLong()) { image.inputStream() }

        val adopted = cache.adopt(MediaCacheCategory.IMAGES, url, image.size.toLong()) { error("ne doit pas être relue") }

        assertThat(adopted).isTrue()
        assertThat(stored(url)).isEqualTo(image)
    }

    @Test
    fun `un son ou une video n entre pas au cache d images`() {
        val url = url()
        val image = png()

        assertThat(cache.adopt(MediaCacheCategory.AUDIO, url, image.size.toLong()) { image.inputStream() }).isFalse()
        assertThat(cache.adopt(MediaCacheCategory.VIDEO, url, image.size.toLong()) { image.inputStream() }).isFalse()

        assertThat(stored(url)).isNull()
    }

    private companion object {
        const val LOAD_TIMEOUT_MILLIS = 10_000L
    }
}
