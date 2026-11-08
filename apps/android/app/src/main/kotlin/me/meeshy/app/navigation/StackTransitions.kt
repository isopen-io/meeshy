package me.meeshy.app.navigation

import androidx.compose.animation.AnimatedContentTransitionScope
import androidx.compose.animation.AnimatedContentTransitionScope.SlideDirection
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.navigation.NavBackStackEntry
import me.meeshy.sdk.model.chrome.RevealGeometry

private const val PUSH_MILLIS = 280
private const val FADE_MILLIS = 200

/** La durée du fondu par défaut du `NavHost` pour tout ce qui n'est pas empilé. */
private const val DEFAULT_MILLIS = 700

/** Combien de la largeur l'écran du dessous reste décalé pendant le glissé : « légèrement », comme iOS. */
private const val UNDERLAY_PARALLAX = 3

/**
 * Les Reels s'ouvrent par un DÉVOILEMENT circulaire que l'écran dessine lui-même (`CircularRevealMask`) : la
 * navigation ne doit donc rien animer, mais tenir l'écran du dessous composé et visible pendant que le disque
 * grandit (0,35 s) puis rétrécit (0,3 s). Un fondu à opacité constante en tient lieu.
 */
private fun NavBackStackEntry.isReels(): Boolean = destination.route == Routes.REELS

private fun NavBackStackEntry.isStacked(): Boolean = NavBackChrome.of(destination.route) == BackChrome.ARROW

/**
 * Les transitions du `NavHost` pour les écrans EMPILÉS (iOS : push / pop). Le pop est celui que le retour
 * interactif sonde : l'écran qui part suit le doigt jusqu'au bord de fin, l'écran précédent revient de 1/3 de
 * largeur. Toutes les directions sont `Start`/`End`, donc miroitées en RTL. Les feuilles et plein écran
 * ([BackChrome.MODAL]) et les racines gardent le fondu par défaut du `NavHost`.
 */
internal fun AnimatedContentTransitionScope<NavBackStackEntry>.stackEnter(): EnterTransition =
    if (targetState.isReels()) {
        fadeIn(tween(RevealGeometry.OPEN_MILLIS), initialAlpha = 1f)
    } else if (targetState.isStacked()) {
        slideIntoContainer(SlideDirection.Start, tween(PUSH_MILLIS), initialOffset = { it / 4 }) + fadeIn(tween(PUSH_MILLIS))
    } else {
        fadeIn(tween(DEFAULT_MILLIS))
    }

internal fun AnimatedContentTransitionScope<NavBackStackEntry>.stackExit(): ExitTransition =
    if (targetState.isReels()) {
        fadeOut(tween(RevealGeometry.OPEN_MILLIS), targetAlpha = 1f)
    } else if (targetState.isStacked()) {
        slideOutOfContainer(SlideDirection.Start, tween(PUSH_MILLIS), targetOffset = { it / UNDERLAY_PARALLAX }) +
            fadeOut(tween(FADE_MILLIS))
    } else {
        fadeOut(tween(DEFAULT_MILLIS))
    }

internal fun AnimatedContentTransitionScope<NavBackStackEntry>.stackPopEnter(): EnterTransition =
    if (initialState.isReels()) {
        EnterTransition.None
    } else if (initialState.isStacked()) {
        slideIntoContainer(SlideDirection.End, tween(PUSH_MILLIS), initialOffset = { it / UNDERLAY_PARALLAX }) +
            fadeIn(tween(PUSH_MILLIS))
    } else {
        fadeIn(tween(DEFAULT_MILLIS))
    }

internal fun AnimatedContentTransitionScope<NavBackStackEntry>.stackPopExit(): ExitTransition =
    if (initialState.isReels()) {
        fadeOut(tween(RevealGeometry.CLOSE_MILLIS), targetAlpha = 1f)
    } else if (initialState.isStacked()) {
        slideOutOfContainer(SlideDirection.End, tween(PUSH_MILLIS)) + fadeOut(tween(FADE_MILLIS))
    } else {
        fadeOut(tween(DEFAULT_MILLIS))
    }
