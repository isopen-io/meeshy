package me.meeshy.ui.component.media

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Color
import android.media.ExifInterface
import android.os.Looper
import androidx.test.core.app.ApplicationProvider
import coil.ImageLoader
import coil.request.CachePolicy
import coil.request.ImageRequest
import coil.request.ImageResult
import coil.request.SuccessResult
import com.google.common.truth.Truth.assertThat
import java.io.File
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.async
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class MeeshyImageLoaderTest {
    private val context: Context = ApplicationProvider.getApplicationContext()

    /** Une prise de l'objectif telle que `MediaIntake` la copie : pixels au sens du capteur, quart de tour dans l'EXIF, nom sans extension. */
    private fun capturedWithoutExtension(): File {
        val file = File(context.cacheDir, "prise-${System.nanoTime()}")
        val bitmap = Bitmap.createBitmap(40, 20, Bitmap.Config.ARGB_8888).apply { eraseColor(Color.RED) }
        file.outputStream().use { bitmap.compress(Bitmap.CompressFormat.JPEG, 90, it) }
        ExifInterface(file.path).apply {
            setAttribute(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_ROTATE_90.toString())
            saveAttributes()
        }
        return file
    }

    @OptIn(ExperimentalCoroutinesApi::class)
    private fun load(loader: ImageLoader, data: Any): ImageResult {
        val request = ImageRequest.Builder(context).data(data).allowHardware(false)
            .memoryCachePolicy(CachePolicy.DISABLED).diskCachePolicy(CachePolicy.DISABLED).build()
        val result = MainScope().async { loader.execute(request) }
        val deadline = System.currentTimeMillis() + 10_000
        while (!result.isCompleted && System.currentTimeMillis() < deadline) {
            shadowOf(Looper.getMainLooper()).idle()
            Thread.sleep(5)
        }
        return result.getCompleted()
    }

    private fun ImageResult.size(): Pair<Int, Int> {
        val drawable = (this as SuccessResult).drawable
        return drawable.intrinsicWidth to drawable.intrinsicHeight
    }

    @Test
    fun `une prise copiee sans extension s affiche a l endroit`() {
        assertThat(load(MeeshyImageLoader.build(context), capturedWithoutExtension()).size()).isEqualTo(20 to 40)
    }

    @Test
    fun `des octets en memoire sans type s affichent a l endroit`() {
        assertThat(load(MeeshyImageLoader.build(context), capturedWithoutExtension().readBytes()).size()).isEqualTo(20 to 40)
    }
}
