package me.meeshy.app.stories

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import me.meeshy.sdk.model.composer.scene.StoryBackdrop
import me.meeshy.ui.theme.hexColor

/**
 * Le fond des bandes d'un média AJUSTÉ (iOS `StoryLetterboxFill`), le même au compositeur et au player : une teinte unie, ou le
 * flou du média lui-même. Le flou n'existe qu'à partir de l'API 31 ; en dessous le noir tient la place, jamais un flou factice.
 * Sans [model] à flouter (une vidéo sans affiche), rien n'est peint : le sol de la scène reste dessous.
 */
@Composable
internal fun SceneBackdropLayer(backdrop: StoryBackdrop, model: Any?) {
    val hex = backdrop.solidHex
    when {
        hex != null -> Box(Modifier.fillMaxSize().background(hexColor(hex)))
        model == null -> Unit
        android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.S -> AsyncImage(
            model = model,
            contentDescription = null,
            contentScale = ContentScale.Crop,
            modifier = Modifier.fillMaxSize().blur(BACKDROP_BLUR_DP.dp),
        )
        else -> Box(Modifier.fillMaxSize().background(hexColor(StoryBackdrop.BLACK.solidHex.orEmpty())))
    }
}

private const val BACKDROP_BLUR_DP = 24
