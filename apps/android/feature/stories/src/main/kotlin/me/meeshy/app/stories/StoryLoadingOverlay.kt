package me.meeshy.app.stories

import android.os.Build
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import kotlinx.coroutines.delay
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.story.StoryLoadingOverlayPolicy
import me.meeshy.ui.component.media.rememberThumbHashPainter
import me.meeshy.ui.theme.MeeshyPalette

/**
 * Le placeholder cache-first du lecteur (iOS `StoryReaderLoadingOverlay`) : l'empreinte floutée dès la première image,
 * la miniature nette si elle est déjà là, puis un spinner discret armé après 200 ms et sous 0,20 de progression — un
 * cache chaud ne le voit jamais. Il se retire à 0,95. [progress] vaut 1 quand le média de la slide est prêt.
 */
@Composable
internal fun StoryLoadingOverlay(
    slideKey: String,
    thumbHash: String?,
    coverUrl: String?,
    progress: Float,
    modifier: Modifier = Modifier,
) {
    val progressNow by rememberUpdatedState(progress)
    var spinnerArmed by remember(slideKey) { mutableStateOf(false) }
    LaunchedEffect(slideKey) {
        spinnerArmed = false
        delay(StoryLoadingOverlayPolicy.SPINNER_GRACE_MS)
        spinnerArmed = StoryLoadingOverlayPolicy.armsSpinner(progressNow.toDouble())
    }
    val label = stringResource(R.string.story_reader_loading)
    AnimatedVisibility(
        visible = StoryLoadingOverlayPolicy.isMounted(progress.toDouble()),
        enter = fadeIn(tween(0)),
        exit = fadeOut(tween(250)),
        modifier = modifier,
    ) {
        Box(Modifier.fillMaxSize().clipToBounds().semantics { contentDescription = label }) {
            val painter = rememberThumbHashPainter(thumbHash)
            if (painter != null) {
                Image(
                    painter = painter,
                    contentDescription = null,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxSize().then(if (Build.VERSION.SDK_INT >= 31) Modifier.blur(8.dp) else Modifier),
                )
            } else {
                Box(
                    Modifier.fillMaxSize().background(
                        Brush.linearGradient(listOf(Color.Black, MeeshyPalette.Indigo950, MeeshyPalette.Indigo900)),
                    ),
                )
            }
            if (!coverUrl.isNullOrEmpty()) {
                AsyncImage(model = coverUrl, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
            }
            if (StoryLoadingOverlayPolicy.showsSpinner(spinnerArmed, progress.toDouble())) {
                Box(
                    contentAlignment = Alignment.Center,
                    modifier = Modifier.align(Alignment.Center).size(80.dp).clip(CircleShape).background(Color.Black.copy(alpha = 0.35f)),
                ) {
                    CircularProgressIndicator(color = MeeshyPalette.White, strokeWidth = 2.dp, modifier = Modifier.size(32.dp))
                }
            }
        }
    }
}
