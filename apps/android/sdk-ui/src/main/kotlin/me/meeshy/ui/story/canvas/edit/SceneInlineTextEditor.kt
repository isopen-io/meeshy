package me.meeshy.ui.story.canvas.edit

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import me.meeshy.sdk.model.scene.InlineEditLayout
import me.meeshy.ui.accessibility.LocalReduceMotion

private const val SCRIM_FADE_MILLIS = 180

/**
 * Le voile posé sur le reste du canvas pendant la saisie en place (miroir de `inlineEditScrimLayer`, iOS) : le texte écrit
 * se détache, son fond reste visible au-dessus. Il fond en entrée et en sortie (en fondu simple sous « Réduire les
 * animations », sans mouvement) et ne prend AUCUNE touche : le canvas dessous continue de les recevoir, y compris celles
 * qui désignent un autre objet.
 */
@Composable
public fun SceneInlineEditScrim(visible: Boolean, modifier: Modifier = Modifier) {
    val reduceMotion = LocalReduceMotion.current
    val alpha by animateFloatAsState(
        targetValue = if (visible) InlineEditLayout.SCRIM_ALPHA else 0f,
        animationSpec = if (reduceMotion) snap() else tween(SCRIM_FADE_MILLIS),
        label = "inlineEditScrim",
    )
    if (alpha > 0f) Box(modifier.fillMaxSize().background(Color.Black.copy(alpha = alpha)))
}
