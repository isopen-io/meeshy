package me.meeshy.ui.component.reaction

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.MutableTransitionState
import androidx.compose.animation.core.spring
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntRect
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Popup
import androidx.compose.ui.window.PopupPositionProvider
import androidx.compose.ui.window.PopupProperties
import me.meeshy.sdk.model.EmojiCatalog
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.component.EmojiQuickStrip
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.motion.meeshyEnter
import me.meeshy.ui.motion.meeshyExit
import me.meeshy.ui.theme.MeeshyMotion

/** Du côté de la cible où la palette s'aligne. */
public enum class PostReactionPaletteAnchor { Start, End }

/**
 * **La palette de réactions d'un POST ou d'un RÉEL** — iso `PostReactionPalette.swift` : la bande
 * d'émojis partagée avec les messages et les stories ([emojis] : les récents d'abord, par
 * `EmojiUsageStore.top`), ancrée à la cible qui l'ouvre.
 *
 * Ce composant porte l'état et le geste, ni la mise en page ni l'envoi : l'hôte le pose DANS le
 * conteneur de sa cible (l'ancrage suit ses bornes), décide [isOpen] et exécute [onPick] — chaque
 * surface garde son envoi optimiste. Choisir un émoji ou toucher à l'extérieur ferme ; le choix
 * s'accompagne d'un haptique léger. Entrée et sortie en ressort (réponse 0,3 / amortissement 0,7) : échelle 0,85
 * ancrée côté [anchor] et fondu ; la fenêtre reste ouverte le temps de la sortie, sans rejouer un choix. Fondu court
 * seul quand « Réduire les animations » est actif.
 */
@Composable
public fun PostReactionPalette(
    isOpen: Boolean,
    onDismiss: () -> Unit,
    onPick: (String) -> Unit,
    modifier: Modifier = Modifier,
    emojis: List<String> = EmojiCatalog.defaultQuickReactions,
    anchor: PostReactionPaletteAnchor = PostReactionPaletteAnchor.End,
) {
    val visibility = remember { MutableTransitionState(false) }
    visibility.targetState = isOpen
    if (!isOpen && visibility.isIdle && !visibility.currentState) return
    val haptics = rememberMeeshyHaptics()
    val reduceMotion = LocalReduceMotion.current
    val gapPx = with(LocalDensity.current) { 8.dp.roundToPx() }
    val positioner = remember(anchor, gapPx) { AnchoredAbovePositioner(anchor, gapPx) }
    val origin = TransformOrigin(pivotFractionX = if (anchor == PostReactionPaletteAnchor.End) 1f else 0f, pivotFractionY = 1f)
    Popup(
        popupPositionProvider = positioner,
        onDismissRequest = { if (isOpen) onDismiss() },
        properties = PopupProperties(focusable = true),
    ) {
        AnimatedVisibility(
            visibleState = visibility,
            enter = meeshyEnter(reduceMotion, scaleIn(paletteSpring(), ENTER_SCALE, origin) + fadeIn(paletteSpring())),
            exit = meeshyExit(reduceMotion, scaleOut(paletteSpring(), ENTER_SCALE, origin) + fadeOut(paletteSpring())),
            label = "post-reaction-palette",
        ) {
            EmojiQuickStrip(
                emojis = emojis,
                onReact = { emoji ->
                    if (isOpen) {
                        haptics.light()
                        onPick(emoji)
                    }
                },
                modifier = modifier,
            )
        }
    }
}

/** Le ressort d'iOS `PostReactionPalette` : réponse 0,3 s, amortissement 0,7, à l'entrée comme à la sortie. */
private fun <T> paletteSpring() = spring<T>(dampingRatio = 0.7f, stiffness = MeeshyMotion.stiffnessForResponse(0.3f))

private const val ENTER_SCALE: Float = 0.85f

/** Au-dessus de la cible (sous elle si la place manque), alignée sur son bord, bornée à la fenêtre. */
internal class AnchoredAbovePositioner(
    private val anchor: PostReactionPaletteAnchor,
    private val gapPx: Int,
) : PopupPositionProvider {
    override fun calculatePosition(
        anchorBounds: IntRect,
        windowSize: IntSize,
        layoutDirection: LayoutDirection,
        popupContentSize: IntSize,
    ): IntOffset {
        val alignRight = (anchor == PostReactionPaletteAnchor.End) == (layoutDirection == LayoutDirection.Ltr)
        val rawX = if (alignRight) anchorBounds.right - popupContentSize.width else anchorBounds.left
        val x = rawX.coerceIn(0, (windowSize.width - popupContentSize.width).coerceAtLeast(0))
        val above = anchorBounds.top - popupContentSize.height - gapPx
        val y = if (above >= 0) above else anchorBounds.bottom + gapPx
        return IntOffset(x, y)
    }
}
