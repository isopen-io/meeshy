package me.meeshy.ui.motion

import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import me.meeshy.ui.theme.MeeshyMotion

/** Duree du repli en fondu du zoom quand on reduit les animations (plus court que le fondu commun). */
internal const val ZOOM_REDUCED_FADE_MILLIS: Int = 120

private const val ZOOM_FROM_SCALE = 0.92f

/** Entree « zoom » (iOS `navigationTransition(.zoom)`) : echelle + fondu en ressort ; fondu court sous reduction. */
public fun meeshyZoomEnter(reduce: Boolean): EnterTransition =
    if (reduce) fadeIn(tween(ZOOM_REDUCED_FADE_MILLIS)) else
        scaleIn(MeeshyMotion.springDefault(), initialScale = ZOOM_FROM_SCALE) + fadeIn(MeeshyMotion.springDefault())

/** Sortie « zoom » symetrique ; fondu court sous reduction. */
public fun meeshyZoomExit(reduce: Boolean): ExitTransition =
    if (reduce) fadeOut(tween(ZOOM_REDUCED_FADE_MILLIS)) else
        scaleOut(MeeshyMotion.springDefault(), targetScale = ZOOM_FROM_SCALE) + fadeOut(MeeshyMotion.springDefault())
