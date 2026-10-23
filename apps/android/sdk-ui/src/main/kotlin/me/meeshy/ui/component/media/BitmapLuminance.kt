package me.meeshy.ui.component.media

import android.graphics.Bitmap
import androidx.compose.runtime.Composable
import androidx.compose.runtime.State
import androidx.compose.runtime.produceState
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import me.meeshy.sdk.model.theme.CanvasChromeScheme

/**
 * Luminance relative WCAG moyenne d'un bitmap de fond : rééchantillonné en 8×8, luminance
 * linéarisée de chaque pixel moyennée. Calculée HORS du thread principal ([dispatcher]) ; `null`
 * si le bitmap n'est pas lisible — l'appelant retombe alors sur la convention chrome blanc.
 */
public suspend fun Bitmap.averageRelativeLuminance(
    dispatcher: CoroutineDispatcher = Dispatchers.Default,
): Double? = withContext(dispatcher) {
    try {
        if (isRecycled) return@withContext null
        val readable = if (config == Bitmap.Config.HARDWARE) {
            copy(Bitmap.Config.ARGB_8888, false) ?: return@withContext null
        } else {
            this@averageRelativeLuminance
        }
        val side = CanvasChromeScheme.SAMPLE_SIDE
        val sampled = Bitmap.createScaledBitmap(readable, side, side, true)
        val pixels = IntArray(side * side)
        sampled.getPixels(pixels, 0, side, 0, 0, side, side)
        CanvasChromeScheme.averageRelativeLuminance(pixels)
    } catch (cancelled: CancellationException) {
        throw cancelled
    } catch (_: Exception) {
        null
    }
}

/** La luminance d'un fond média, mesurée hors thread principal ; `null` tant qu'elle n'est pas connue. */
@Composable
public fun rememberBitmapLuminance(bitmap: Bitmap?): State<Double?> =
    produceState<Double?>(null, bitmap) { value = bitmap?.averageRelativeLuminance() }
