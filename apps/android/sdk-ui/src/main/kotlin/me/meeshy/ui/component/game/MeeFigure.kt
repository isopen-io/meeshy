package me.meeshy.ui.component.game

import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.semantics.SemanticsPropertyKey
import androidx.compose.ui.semantics.SemanticsPropertyReceiver
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import com.airbnb.lottie.compose.LottieAnimation
import com.airbnb.lottie.compose.LottieCompositionSpec
import com.airbnb.lottie.compose.LottieConstants
import com.airbnb.lottie.compose.rememberLottieComposition
import me.meeshy.ui.accessibility.LocalReduceMotion

/** Ce qu'une figure montre : rien (film inconnu), la première image, ou le film qui boucle. */
internal enum class MeeFigureMode { EMPTY, STILL, ANIMATED }

internal val MeeFigureModeKey = SemanticsPropertyKey<MeeFigureMode>("MeeFigureMode")
internal var SemanticsPropertyReceiver.meeFigureMode by MeeFigureModeKey

internal fun meeFigureMode(filmId: String, animates: Boolean, reduceMotion: Boolean): MeeFigureMode = when {
    MeeFilmCatalog.assetPath(filmId) == null -> MeeFigureMode.EMPTY
    animates && !reduceMotion && MeeFilmCatalog.isAnimated(filmId) -> MeeFigureMode.ANIMATED
    else -> MeeFigureMode.STILL
}

/**
 * Un colibri, Mee ou Meo, dans un carré de [side]. Fixe (première image) sous « Réduire les animations » ou quand
 * [animates] est faux (tenant d'une brique) ; décoratif : il ne prend ni le focus ni le toucher du texte voisin.
 * [mirrored] retourne Meo pour qu'il regarde vers l'intérieur de l'objet.
 */
@Composable
public fun MeeFigure(
    filmId: String,
    side: Dp,
    modifier: Modifier = Modifier,
    animates: Boolean = true,
    mirrored: Boolean = false,
) {
    val mode = meeFigureMode(filmId, animates, LocalReduceMotion.current)
    val frame = modifier
        .size(side)
        .clipToBounds()
        .graphicsLayer { scaleX = if (mirrored) -1f else 1f }
        .semantics { meeFigureMode = mode }
    val path = MeeFilmCatalog.assetPath(filmId)
    if (mode == MeeFigureMode.EMPTY || path == null) {
        Box(frame)
        return
    }
    val composition by rememberLottieComposition(LottieCompositionSpec.Asset(path))
    if (mode == MeeFigureMode.ANIMATED) {
        LottieAnimation(composition, frame, iterations = LottieConstants.IterateForever)
    } else {
        LottieAnimation(composition, progress = { 0f }, modifier = frame)
    }
}
