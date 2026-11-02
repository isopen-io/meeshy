package me.meeshy.ui.component

import android.content.Context
import android.graphics.Bitmap
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.unit.dp
import androidx.test.core.app.ApplicationProvider
import coil.Coil
import coil.ImageLoader
import coil.memory.MemoryCache
import java.io.IOException
import me.meeshy.ui.theme.MeeshyTheme
import okhttp3.OkHttpClient
import org.junit.After
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * #12569 — la PREMIÈRE image d'un cercle d'avatar (miroir de la sonde `WarmImageProbe` de
 * `CachedAvatarImage`, iOS) : une photo déjà en mémoire, à une taille qui couvre le cercle, le tient
 * d'emblée — ses initiales n'y passent pas, même une image, à chaque ligne qui revient à l'écran.
 * Absente ou trop petite, ce sont les initiales qui tiennent le cercle pendant qu'elle charge.
 *
 * L'horloge est arrêtée : on lit la composition initiale, celle que la première image dessine.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class AvatarDiscFirstFrameTest {

    @get:Rule
    val compose = createComposeRule()

    private val context: Context = ApplicationProvider.getApplicationContext()

    private val base = "https://gate.meeshy.me/api/v1"
    private val served = "2026/09/abc/photo.png"
    private val resolved = "https://gate.meeshy.me/api/v1/attachments/file/2026/09/abc/photo.png"

    @After
    fun resetImages() {
        Coil.reset()
    }

    private fun loaderHolding(sidePx: Int?): ImageLoader {
        val loader = ImageLoader.Builder(context)
            .memoryCache { MemoryCache.Builder(context).maxSizeBytes(MEMORY_BYTES).build() }
            .okHttpClient { OkHttpClient.Builder().addInterceptor { throw IOException("aucun réseau en test") }.build() }
            .build()
        sidePx?.let { side ->
            loader.memoryCache?.set(MemoryCache.Key(resolved), MemoryCache.Value(Bitmap.createBitmap(side, side, Bitmap.Config.ARGB_8888)))
        }
        return loader
    }

    private fun showFirstFrame(loader: ImageLoader) {
        Coil.setImageLoader(loader)
        compose.mainClock.autoAdvance = false
        compose.setContent {
            MeeshyTheme {
                CompositionLocalProvider(LocalMediaBaseUrl provides base) {
                    MeeshyAvatar(name = "Alice Martin", size = 48.dp, imageUrl = served)
                }
            }
        }
    }

    @Test
    fun `une photo deja en memoire tient le cercle des la premiere image, sans ses initiales`() {
        showFirstFrame(loaderHolding(sidePx = 512))

        compose.onNodeWithText("AM").assertDoesNotExist()
    }

    @Test
    fun `une photo absente de la memoire laisse ses initiales tenir le cercle`() {
        showFirstFrame(loaderHolding(sidePx = null))

        compose.onNodeWithText("AM").assertExists()
    }

    @Test
    fun `une photo en memoire trop petite pour le cercle ne le tient pas d'emblee`() {
        showFirstFrame(loaderHolding(sidePx = 8))

        compose.onNodeWithText("AM").assertExists()
    }

    private companion object {
        const val MEMORY_BYTES = 8 * 1024 * 1024
    }
}
