@file:OptIn(ExperimentalSharedTransitionApi::class)

package me.meeshy.app.feed

import androidx.compose.animation.AnimatedVisibilityScope
import androidx.compose.animation.ExperimentalSharedTransitionApi
import androidx.compose.animation.SharedTransitionScope
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier

/**
 * Les deux portées d'une transition d'élément partagé, posées par la racine de l'application autour de la navigation.
 * Sans elles (`null`), aucune transition : la carte et la galerie se présentent comme avant (repli iOS 16-17).
 */
@Stable
class SceneZoomScopes(val shared: SharedTransitionScope, val visibility: AnimatedVisibilityScope)

val LocalSceneZoomScopes = staticCompositionLocalOf<SceneZoomScopes?> { null }

/**
 * Marque ce cadre comme SOURCE (la carte de scène du fil) ou DESTINATION (la galerie ouverte sur la scène) du zoom [key] :
 * l'écran grandit depuis le cadre touché, puis y revient à la fermeture. Sans [key] ou sans portées, aucun effet.
 */
@Composable
internal fun Modifier.sceneZoom(key: String?): Modifier {
    val scopes = LocalSceneZoomScopes.current
    if (scopes == null || key == null) return this
    val self = this
    return with(scopes.shared) {
        self.sharedElement(
            state = rememberSharedContentState(key = key),
            animatedVisibilityScope = scopes.visibility,
        )
    }
}
