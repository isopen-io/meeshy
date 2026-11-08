package me.meeshy.ui.component.game

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.SemanticsPropertyKey
import androidx.compose.ui.semantics.SemanticsPropertyReceiver
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import com.airbnb.lottie.compose.LottieAnimation
import com.airbnb.lottie.compose.LottieCompositionSpec
import com.airbnb.lottie.compose.LottieConstants
import com.airbnb.lottie.compose.rememberLottieComposition
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.sticker.MeeStickerStill

/** Ce qu'une figure montre : rien (film inconnu), la première image, ou le film qui boucle. */
internal enum class MeeFigureMode { EMPTY, STILL, ANIMATED }

internal val MeeFigureModeKey = SemanticsPropertyKey<MeeFigureMode>("MeeFigureMode")
internal var SemanticsPropertyReceiver.meeFigureMode by MeeFigureModeKey

/** Vrai quand la figure dessine au-delà de son carré (#14534) : ses étincelles ne sont pas rognées. */
internal val MeeFigureBleedsKey = SemanticsPropertyKey<Boolean>("MeeFigureBleeds")
internal var SemanticsPropertyReceiver.meeFigureBleeds by MeeFigureBleedsKey

internal fun meeFigureMode(filmId: String, animates: Boolean, reduceMotion: Boolean): MeeFigureMode = when {
    MeeFilmCatalog.assetPath(filmId) == null -> MeeFigureMode.EMPTY
    animates && !reduceMotion && MeeFilmCatalog.isAnimated(filmId) -> MeeFigureMode.ANIMATED
    else -> MeeFigureMode.STILL
}

/**
 * Un colibri, Mee ou Meo, dans un carré de [side]. Fixe (première image) sous « Réduire les animations » ou quand
 * [animates] est faux (tenant d'une brique) ; décoratif : il ne prend ni le focus ni le toucher du texte voisin.
 * [mirrored] retourne Meo pour qu'il regarde vers l'intérieur de l'objet. [bleeds] laisse le film dessiner hors de son
 * carré, comme iOS qui ne le rogne pas : l'hôte lui réserve alors la marge ([me.meeshy.sdk.model.StickerBoxLaw.filmBleed]).
 */
@Composable
public fun MeeFigure(
    filmId: String,
    side: Dp,
    modifier: Modifier = Modifier,
    animates: Boolean = true,
    mirrored: Boolean = false,
    bleeds: Boolean = false,
) {
    val mode = meeFigureMode(filmId, animates, LocalReduceMotion.current)
    val sized = modifier.size(side)
    val frame = (if (bleeds) sized else sized.clipToBounds())
        .graphicsLayer { scaleX = if (mirrored) -1f else 1f }
        .semantics {
            meeFigureMode = mode
            meeFigureBleeds = bleeds
        }
    val path = MeeFilmCatalog.assetPath(filmId)
    if (mode == MeeFigureMode.EMPTY || path == null) {
        Box(frame)
        return
    }
    if (mode == MeeFigureMode.STILL) {
        MeeFigureStill(filmId, side, frame)
        return
    }
    val composition by rememberLottieComposition(LottieCompositionSpec.Asset(path))
    LottieAnimation(
        composition,
        frame,
        iterations = LottieConstants.IterateForever,
        clipToCompositionBounds = !bleeds,
    )
}

/**
 * La première image du film, rendue hors du fil principal par [MeeStickerStill] puis gardée en mémoire bornée — comme
 * iOS `MeeStickerFilmView` peint la case d'une image fixe décodée hors du geste. Une feuille de cinquante cases ne monte
 * ainsi aucun lecteur Lottie ; une case déjà vue se peint dès sa première image.
 */
@Composable
private fun MeeFigureStill(filmId: String, side: Dp, frame: Modifier) {
    val context = LocalContext.current
    val pixels = with(LocalDensity.current) { side.roundToPx() }.coerceIn(1, MeeStickerStill.DEFAULT_SIDE)
    val still by produceState<ImageBitmap?>(MeeStickerStill.cached(filmId, pixels)?.asImageBitmap(), filmId, pixels) {
        if (value == null) value = MeeStickerStill.bitmap(context, filmId, pixels)?.asImageBitmap()
    }
    Box(frame) {
        still?.let { Image(bitmap = it, contentDescription = null, modifier = Modifier.fillMaxSize()) }
    }
}
