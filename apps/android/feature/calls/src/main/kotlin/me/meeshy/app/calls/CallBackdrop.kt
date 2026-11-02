package me.meeshy.app.calls

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.os.Build
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.scale
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import coil.compose.AsyncImage

private const val BACKDROP_SCALE = 1.08f
private const val BLURRED_ALPHA = 0.7f
private const val UNBLURRED_ALPHA = 0.4f
private val BACKDROP_BLUR = 20.dp

/**
 * Le fond de l'écran d'appel : le dégradé sombre épinglé, et par-dessus le visage du contact
 * (bannière, à défaut avatar) flouté d'environ 20 dp, agrandi de 8 % pour que les bords du
 * flou ne se voient pas, sous un voile qui garde le chrome lisible. Le flou est un
 * `RenderEffect` dès l'API 31 ; en dessous, le visage est seulement assombri. [imageUrl] est
 * `null` quand rien n'est connu ou quand une vidéo distante couvre déjà l'écran.
 */
@Composable
internal fun CallBackdrop(imageUrl: String?, modifier: Modifier = Modifier) {
    Box(modifier = modifier.fillMaxSize().background(CallPalette.background())) {
        if (!imageUrl.isNullOrBlank()) {
            val blurred = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
            AsyncImage(
                model = imageUrl,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier
                    .fillMaxSize()
                    .scale(BACKDROP_SCALE)
                    .then(if (blurred) Modifier.blur(BACKDROP_BLUR) else Modifier)
                    .alpha(if (blurred) BLURRED_ALPHA else UNBLURRED_ALPHA),
            )
            Box(Modifier.fillMaxSize().background(CallPalette.veil()))
        }
    }
}

/**
 * Mode immersif : la barre d'état se cache pendant l'appel (elle revient d'un balayage du
 * bord) et revient à la fermeture de l'écran. Le fond reste bord à bord ; seul le contenu
 * se pose dans les insets.
 */
@Composable
internal fun CallImmersiveEffect() {
    val context = LocalContext.current
    DisposableEffect(context) {
        val window = context.findActivity()?.window
        val controller = window?.let { WindowCompat.getInsetsController(it, it.decorView) }
        controller?.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        controller?.hide(WindowInsetsCompat.Type.statusBars())
        onDispose { controller?.show(WindowInsetsCompat.Type.statusBars()) }
    }
}

private tailrec fun Context.findActivity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.findActivity()
    else -> null
}
