package me.meeshy.app.reels

import androidx.activity.compose.BackHandler
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.EaseIn
import androidx.compose.animation.core.EaseOut
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.chrome.FloatingButtonGeometry
import me.meeshy.sdk.model.chrome.RevealGeometry
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.component.chrome.CircularRevealMask
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.layout.currentMeeshyWindowInfo

/**
 * Le dévoilement circulaire du lecteur (iOS `ReelsRevealContainer`) : un disque né au centre du bouton
 * Reels (0,35 s ease-out), refermé à l'envers à la sortie (0,3 s ease-in) ; sous « Réduire les animations »
 * (échelle d'animation système nulle, [LocalReduceMotion]) un simple fondu. Il porte aussi la fermeture :
 * bouton retour système et [content] reçoivent le même `requestClose`, qui coupe le média, vibre une fois
 * légèrement puis rend la main à la navigation sans démonter l'écran avant la fin du disque.
 *
 * [revealCompleted] n'est vrai qu'une fois le disque plein : c'est la porte d'autostart des pages.
 */
@Composable
internal fun ReelsRevealContainer(
    feedButtonStorage: String,
    onClose: () -> Unit,
    onBeforeClose: () -> Unit,
    content: @Composable (requestClose: () -> Unit, revealCompleted: Boolean) -> Unit,
) {
    val reduceMotion = LocalReduceMotion.current
    val haptics = rememberMeeshyHaptics()
    val reveal = remember { Animatable(0f) }
    var closing by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val closeNow by rememberUpdatedState(onClose)
    val beforeCloseNow by rememberUpdatedState(onBeforeClose)
    val revealCompleted by remember { derivedStateOf { RevealGeometry.isCovering(reveal.value) && !closing } }
    LaunchedEffect(Unit) {
        reveal.animateTo(1f, tween(RevealGeometry.durationMillis(opening = true, reduceMotion = reduceMotion), easing = EaseOut))
    }
    val requestClose: () -> Unit = remember(haptics, scope, reduceMotion) {
        fun() {
            if (closing) return
            closing = true
            beforeCloseNow()
            haptics.light()
            scope.launch {
                launch { closeNow() }
                reveal.animateTo(0f, tween(RevealGeometry.durationMillis(opening = false, reduceMotion = reduceMotion), easing = EaseIn))
            }
        }
    }
    BackHandler(enabled = !closing) { requestClose() }

    val safeInsets = currentMeeshyWindowInfo().safeInsets
    BoxWithConstraints(Modifier.fillMaxSize()) {
        val center = remember(maxWidth, maxHeight, safeInsets, feedButtonStorage) {
            val geometry = FloatingButtonGeometry(maxWidth.value, maxHeight.value, safeInsets)
            val point = geometry.centerForStorage(feedButtonStorage, FloatingButtonGeometry.DEFAULT_FEED_STORAGE)
            RevealGeometry.unitCenter(point.x, point.y, maxWidth.value, maxHeight.value)
        }
        CircularRevealMask(progress = { reveal.value }, center = center, reduceMotion = reduceMotion) {
            content(requestClose, revealCompleted)
        }
    }
}
