package me.meeshy.app.stories

import androidx.compose.ui.test.junit4.ComposeContentTestRule

/**
 * Un toucher sur le fond de la scène n'est émis qu'APRÈS l'échec du double-toucher (`sceneBackgroundGestures`, qui
 * attend la fenêtre de double-toucher de 300 ms) : un témoin qui touche la scène fait passer cette fenêtre avant de
 * regarder ce que le toucher a produit.
 */
internal fun ComposeContentTestRule.passSceneDoubleTapWindow() {
    mainClock.advanceTimeBy(SCENE_DOUBLE_TAP_WINDOW_MS)
    waitForIdle()
}

private const val SCENE_DOUBLE_TAP_WINDOW_MS = 400L
