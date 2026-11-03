package me.meeshy.app.stories

import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalDensity
import me.meeshy.sdk.model.StoryCommentsZone

/**
 * Où se pose la liste de commentaires (iOS `StoryCommentsZone`, #9893) : la loi pure est
 * [StoryCommentsZone] (`:core:model`) ; ici seulement la lecture de la fenêtre, de la zone sûre et du clavier, en dp.
 * La zone suit le clavier dans la même composition que le composeur : même courbe, aucun saut.
 */
@Composable
internal fun rememberStoryCommentsFrame(composerPinned: Boolean, composerHeightPx: Int, topReservedPx: Int): StoryCommentsZone.Frame {
    val density = LocalDensity.current
    val windowHeight = LocalConfiguration.current.screenHeightDp.toFloat()
    val safeBottom = with(density) { WindowInsets.navigationBars.getBottom(density).toDp().value }
    val keyboard = with(density) { WindowInsets.ime.getBottom(density).toDp().value }
    val composerHeight = with(density) { composerHeightPx.takeIf { it > 0 }?.toDp()?.value }
    val state = StoryCommentsZone.state(hasComposer = composerPinned, isShown = true, expanded = true, keyboardHeight = keyboard)
    return StoryCommentsZone.frame(
        state,
        StoryCommentsZone.Metrics(
            windowHeight = windowHeight,
            safeBottom = safeBottom,
            topReserved = with(density) { topReservedPx.toDp().value },
            composerHeight = composerHeight,
            keyboardHeight = keyboard,
        ),
    )
}
