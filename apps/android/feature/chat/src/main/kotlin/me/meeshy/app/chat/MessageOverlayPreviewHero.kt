package me.meeshy.app.chat

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.systemBars
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntRect
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Popup
import androidx.compose.ui.window.PopupPositionProvider
import androidx.compose.ui.window.PopupProperties
import me.meeshy.ui.component.bubble.BubbleContent
import me.meeshy.ui.component.bubble.MessageBubble
import kotlin.math.roundToInt

/**
 * Elevated floating preview of the long-pressed message — the Android port of the
 * hero bubble iOS renders above its `MessageOverlayMenu`. Position and scale come
 * from the pure [MessageOverlayLayout]: a tall message shrinks to stay on-screen
 * and the hero is anchored to its source bubble's trailing/leading edge.
 *
 * Purely decorative and non-interactive — it never intercepts input; the action
 * sheet beneath owns dismissal. All decisions live in the tested law; this
 * composable is coverage-exempt glue.
 */
@Composable
internal fun MessageOverlayPreviewHero(
    frame: Rect,
    content: BubbleContent,
    accentColor: Color,
) {
    val density = LocalDensity.current
    val view = LocalView.current
    val insets = WindowInsets.systemBars
    val safeTopPx = insets.getTop(density).toFloat()
    val safeBottomPx = insets.getBottom(density).toFloat()
    val menuWidthPx = with(density) { NOMINAL_MENU_WIDTH.dp.toPx() }
    val menuHeightPx = with(density) { NOMINAL_MENU_HEIGHT.dp.toPx() }

    val cluster = remember(frame, content.isOutgoing, view.width, view.height, safeTopPx, safeBottomPx) {
        MessageOverlayLayout.compute(
            bubble = OverlayRect(left = frame.left, top = frame.top, width = frame.width, height = frame.height),
            screenWidth = view.width.toFloat(),
            screenHeight = view.height.toFloat(),
            safeTop = safeTopPx,
            safeBottom = safeBottomPx,
            menuWidth = menuWidthPx,
            menuHeight = menuHeightPx,
            isOutgoing = content.isOutgoing,
        )
    }

    val offset = IntOffset(cluster.preview.left.roundToInt(), cluster.preview.top.roundToInt())
    val provider = remember(offset) { FixedWindowOffsetProvider(offset) }
    // Scale from the anchored edge (trailing for own messages, leading otherwise)
    // so the hero shrinks toward the side it hugs — matching the law's anchor.
    val origin = if (content.isOutgoing) TransformOrigin(1f, 0f) else TransformOrigin(0f, 0f)

    Popup(
        popupPositionProvider = provider,
        properties = PopupProperties(focusable = false, dismissOnClickOutside = false),
    ) {
        Box(
            modifier = Modifier
                .width(with(density) { frame.width.toDp() })
                .height(with(density) { frame.height.toDp() })
                .graphicsLayer {
                    scaleX = cluster.scale
                    scaleY = cluster.scale
                    transformOrigin = origin
                },
        ) {
            MessageBubble(content = content, outgoingColor = accentColor)
        }
    }
}

/** Nominal action-menu size used only for the hero's vertical fit clamp. */
private const val NOMINAL_MENU_WIDTH = 220f
private const val NOMINAL_MENU_HEIGHT = 260f

/** Positions the popup at a fixed window-space offset, ignoring the anchor. */
private class FixedWindowOffsetProvider(private val offset: IntOffset) : PopupPositionProvider {
    override fun calculatePosition(
        anchorBounds: IntRect,
        windowSize: IntSize,
        layoutDirection: LayoutDirection,
        popupContentSize: IntSize,
    ): IntOffset = offset
}
