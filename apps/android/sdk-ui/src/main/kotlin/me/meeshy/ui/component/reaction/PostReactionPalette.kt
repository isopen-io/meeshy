package me.meeshy.ui.component.reaction

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.graphicsLayer
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
 * s'accompagne d'un haptique léger. Entrée en ressort (réponse 0,3 / amortissement 0,7), en fondu
 * quand « Réduire les animations » est actif.
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
    if (!isOpen) return
    val haptics = rememberMeeshyHaptics()
    val reduceMotion = LocalReduceMotion.current
    val gapPx = with(LocalDensity.current) { 8.dp.roundToPx() }
    val positioner = remember(anchor, gapPx) { AnchoredAbovePositioner(anchor, gapPx) }
    var entered by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { entered = true }
    val scale by animateFloatAsState(
        targetValue = if (entered || reduceMotion) 1f else ENTER_SCALE,
        animationSpec = spring(dampingRatio = 0.7f, stiffness = MeeshyMotion.stiffnessForResponse(0.3f)),
        label = "post-reaction-palette-scale",
    )
    val alpha by animateFloatAsState(
        targetValue = if (entered) 1f else 0f,
        animationSpec = spring(dampingRatio = 0.7f, stiffness = MeeshyMotion.stiffnessForResponse(0.3f)),
        label = "post-reaction-palette-alpha",
    )
    Popup(
        popupPositionProvider = positioner,
        onDismissRequest = onDismiss,
        properties = PopupProperties(focusable = true),
    ) {
        EmojiQuickStrip(
            emojis = emojis,
            onReact = { emoji ->
                haptics.light()
                onPick(emoji)
            },
            modifier = modifier.graphicsLayer {
                transformOrigin = TransformOrigin(
                    pivotFractionX = if (anchor == PostReactionPaletteAnchor.End) 1f else 0f,
                    pivotFractionY = 1f,
                )
                scaleX = scale
                scaleY = scale
                this.alpha = alpha
            },
        )
    }
}

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
