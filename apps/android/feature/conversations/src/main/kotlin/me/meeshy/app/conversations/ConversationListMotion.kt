package me.meeshy.app.conversations

import android.os.SystemClock
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FiniteAnimationSpec
import androidx.compose.animation.core.VisibilityThreshold
import androidx.compose.animation.core.spring
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.unit.IntOffset
import me.meeshy.sdk.model.conversationlist.ConversationListReorderMotion
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.theme.MeeshyMotion

private const val ENTRY_SCALE_FROM = 0.95f
private const val ENTRY_OFFSET_PX_AT_DENSITY_1 = 8f
private const val FOLD_RESPONSE_SECONDS = 0.3f
private const val FOLD_DAMPING = 0.8f

/** Le ressort de repli / dépliage d'une section (iOS `spring(response: 0.3, dampingFraction: 0.8)`). */
internal fun <T> sectionFoldSpring(): androidx.compose.animation.core.SpringSpec<T> =
    spring(dampingRatio = FOLD_DAMPING, stiffness = MeeshyMotion.stiffnessForResponse(FOLD_RESPONSE_SECONDS))

/**
 * Le ressort de placement des lignes pour CE passage de liste : celui de la remontée en tête
 * (0,35 s / 0,86) quand [ConversationListReorderMotion.shouldSpring] le décide — la tête change à effectif
 * constant, sans défilement depuis 0,3 s, hors Réduire les animations —, sinon `null` : la ligne change de
 * place sans voyager.
 */
@Composable
internal fun rememberBumpPlacementSpec(ids: List<String>, listState: LazyListState): FiniteAnimationSpec<IntOffset>? {
    val reduceMotion = LocalReduceMotion.current
    var lastScrollEnd by remember { mutableLongStateOf(Long.MIN_VALUE) }
    val scrolling = listState.isScrollInProgress
    LaunchedEffect(scrolling) { if (!scrolling) lastScrollEnd = SystemClock.uptimeMillis() }
    val previous = remember { arrayOfNulls<List<String>>(1) }
    val lastTick = if (scrolling) SystemClock.uptimeMillis() else lastScrollEnd.takeIf { it != Long.MIN_VALUE }
    val springs = ConversationListReorderMotion.shouldSpring(
        previous = previous[0],
        current = ids,
        reduceMotion = reduceMotion,
        isScrolling = ConversationListReorderMotion.isScrolling(lastTick, SystemClock.uptimeMillis()),
    )
    SideEffect { previous[0] = ids }
    return if (springs) {
        spring(
            dampingRatio = ConversationListReorderMotion.DAMPING_FRACTION,
            stiffness = MeeshyMotion.stiffnessForResponse(ConversationListReorderMotion.RESPONSE_SECONDS),
            visibilityThreshold = IntOffset.VisibilityThreshold,
        )
    } else {
        null
    }
}

/**
 * L'entrée d'une ligne quand sa section se déplie (iOS `.opacity + .scale(0.95, anchor: .top) + .offset(y: -8)`) :
 * opacité, échelle ancrée en haut et décalage de -8 vers sa place, en ressort 0,3 / 0,8. Sans effet hors
 * dépliage ([animate] faux) et sous Réduire les animations.
 */
@Composable
internal fun Modifier.sectionRowEntry(animate: Boolean): Modifier {
    val reduceMotion = LocalReduceMotion.current
    val runs = animate && !reduceMotion
    val progress = remember { Animatable(if (runs) 0f else 1f) }
    LaunchedEffect(Unit) { if (runs) progress.animateTo(1f, sectionFoldSpring()) }
    if (!runs) return this
    return graphicsLayer {
        val p = progress.value
        alpha = p
        val scale = ENTRY_SCALE_FROM + (1f - ENTRY_SCALE_FROM) * p
        scaleX = scale
        scaleY = scale
        transformOrigin = TransformOrigin(0.5f, 0f)
        translationY = -ENTRY_OFFSET_PX_AT_DENSITY_1 * density * (1f - p)
    }
}
