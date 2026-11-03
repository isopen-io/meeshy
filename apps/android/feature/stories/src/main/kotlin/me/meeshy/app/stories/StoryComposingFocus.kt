package me.meeshy.app.stories

import androidx.compose.animation.core.snap
import androidx.compose.animation.core.tween
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import me.meeshy.sdk.model.story.StoryComposingFocus
import me.meeshy.ui.accessibility.LocalReduceMotion

/**
 * L'opacité d'une couche qui se tait pendant la saisie (iOS `storyFocusFade`) : fondu de 0,2 s sans ressort, instantané
 * sous « Réduire les animations ». L'hôte ne monte la couche que tant que l'opacité est non nulle, donc une couche
 * effacée ne reçoit plus aucun toucher et n'est plus annoncée par TalkBack.
 */
@Composable
internal fun storyFocusAlpha(visible: Boolean): Float {
    val reduceMotion = LocalReduceMotion.current
    val alpha by animateFloatAsState(
        targetValue = if (visible) 1f else 0f,
        animationSpec = if (reduceMotion) snap() else tween(StoryComposingFocus.FADE_MILLIS),
        label = "storyFocusFade",
    )
    return alpha
}
