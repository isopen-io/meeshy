package me.meeshy.app.feed

import android.provider.Settings
import androidx.compose.foundation.Canvas
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableDoubleStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.sp
import kotlin.math.roundToInt
import kotlin.random.Random
import me.meeshy.sdk.model.mood.MoodEmojiRain
import me.meeshy.sdk.model.mood.MoodEmojiRainState

/**
 * La pluie de l'emoji d'une humeur (iOS `MoodEmojiRainView`) : les particules naissent petites,
 * grossissent en oscillant et s'effacent en grossissant. Tout se dessine d'un seul `Canvas`
 * (aucune recomposition par image) ; les tailles sont arrondies pour que le cache de mise en page
 * du texte serve chaque image. Rien ne bouge quand l'utilisateur a coupé les animations système.
 */
@Composable
internal fun MoodEmojiRainLayer(emoji: String, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val animationsOn = remember(context) {
        runCatching {
            Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) > 0f
        }.getOrDefault(true)
    }
    if (!animationsOn || emoji.isBlank()) return
    val measurer = rememberTextMeasurer()
    val density = LocalDensity.current.density
    var state by remember(emoji) { mutableStateOf(MoodEmojiRainState()) }
    var clock by remember(emoji) { mutableDoubleStateOf(0.0) }

    LaunchedEffect(emoji) {
        val random = Random.Default
        val start = withFrameNanos { it }
        while (true) {
            withFrameNanos { nanos ->
                val t = (nanos - start) / 1_000_000_000.0
                state = state.advanced(t, random)
                clock = t
            }
        }
    }

    Canvas(modifier) {
        val widthDp = size.width / density
        val heightDp = size.height / density
        val now = clock
        state.particles.forEach { particle ->
            val frame = MoodEmojiRain.frame(particle, now, widthDp, heightDp)
            if (frame.opacity <= 0.01f) return@forEach
            val layout = measurer.measure(emoji, TextStyle(fontSize = frame.size.roundToInt().sp))
            drawText(
                textLayoutResult = layout,
                topLeft = Offset(
                    frame.centerX * density - layout.size.width / 2f,
                    frame.centerY * density - layout.size.height / 2f,
                ),
                alpha = frame.opacity,
            )
        }
    }
}
