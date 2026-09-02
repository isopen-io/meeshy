package me.meeshy.ui.component.chrome

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.ui.theme.MeeshyGradients
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.NunitoFontFamily

/** Layout constants for [CollapsibleHeader] — parity with iOS `CollapsibleHeader`. */
object CollapsibleHeaderDefaults {
    val ExpandedHeight = 64.dp
    val CollapsedHeight = 44.dp

    /** Reserved for P2-HEAD-01 (compact story-trail reveal) — unused this lot. */
    val AccessoryCollapsedHeight = 60.dp
    val CollapseThreshold = 60.dp
}

/**
 * A collapsible top-bar chrome shared by any scrolling host (Feed, and later Chats) —
 * the single source of the "gradient title that shrinks and a glass fill that fades
 * in as the list scrolls" behaviour, so neither host reinvents it.
 *
 * This component never touches a [androidx.compose.foundation.lazy.LazyListState]
 * itself — [scrollProgress] and [actionsVisible] are computed by the host from its own
 * list state via [CollapsibleHeaderMotion] and [ScrollMotionVisibility], which is what
 * makes the component reusable across hosts with independent lists.
 */
@Composable
fun CollapsibleHeader(
    title: String,
    scrollProgress: Float,
    modifier: Modifier = Modifier,
    expandedHeight: Dp = CollapsibleHeaderDefaults.ExpandedHeight,
    collapsedHeight: Dp = CollapsibleHeaderDefaults.CollapsedHeight,
    windowInsets: WindowInsets = WindowInsets.statusBars,
    titleAccessory: (@Composable BoxScope.(revealProgress: Float) -> Unit)? = null,
    actionsVisible: Boolean = true,
    actions: @Composable RowScope.() -> Unit = {},
) {
    val progress = scrollProgress.coerceIn(0f, 1f)
    val dark = MeeshyTheme.isDark
    val backgroundAlpha = progress * (if (dark) 0.60f else 0.72f)
    val height = CollapsibleHeaderMotion.heightDp(progress, expandedHeight.value, collapsedHeight.value).dp
    val dividerAlpha = CollapsibleHeaderMotion.dividerAlpha(progress)
    val actionsAlpha by animateFloatAsState(
        targetValue = if (actionsVisible) 1f else 0f,
        animationSpec = tween(ScrollMotionVisibility.FADE_DURATION_MS),
        label = "collapsibleHeaderActionsAlpha",
    )
    val density = LocalDensity.current
    var actionsWidthPx by remember { mutableIntStateOf(0) }
    val titleEndPadding = MeeshySpacing.lg + with(density) { actionsWidthPx.toDp() }

    Box(
        modifier
            .fillMaxWidth()
            .windowInsetsPadding(windowInsets)
            .heightIn(min = height)
            .background(MeeshyTheme.tokens.backgroundSecondary.copy(alpha = backgroundAlpha)),
    ) {
        Text(
            text = title,
            style = TextStyle(
                brush = MeeshyGradients.brand,
                fontFamily = NunitoFontFamily,
                fontSize = CollapsibleHeaderMotion.titleFontSizeSp(progress).sp,
                fontWeight = if (CollapsibleHeaderMotion.isTitleBold(progress)) FontWeight.Bold else FontWeight.SemiBold,
            ),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier
                .align(Alignment.CenterStart)
                .padding(start = MeeshySpacing.lg, end = titleEndPadding),
        )

        titleAccessory?.let { accessory ->
            Box(Modifier.fillMaxSize()) {
                accessory(progress)
            }
        }

        Row(
            modifier = Modifier
                .align(Alignment.CenterEnd)
                .padding(horizontal = MeeshySpacing.lg)
                .onSizeChanged { actionsWidthPx = it.width }
                .graphicsLayer { alpha = actionsAlpha },
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
            content = actions,
        )

        Box(
            Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .height(1.dp)
                .background(MeeshyTheme.tokens.inputBorder.copy(alpha = dividerAlpha)),
        )
    }
}

/**
 * Trailing action button for [CollapsibleHeader] — a 40dp glass circle, parity with
 * iOS `feedHeaderActions`. Shared so no host reinvents its own button chrome.
 */
@Composable
fun CollapsibleHeaderActionButton(
    icon: ImageVector,
    contentDescription: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    val dark = MeeshyTheme.isDark
    Box(
        modifier
            .minimumInteractiveComponentSize()
            .size(40.dp)
            .clip(CircleShape)
            .background(MeeshyTheme.tokens.backgroundSecondary.copy(alpha = 0.60f))
            .border(1.dp, MeeshyGradients.glassBorder(dark), CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        IconButton(onClick = onClick, enabled = enabled) {
            Icon(
                imageVector = icon,
                contentDescription = contentDescription,
                tint = MeeshyPalette.Indigo500,
                modifier = Modifier.size(18.dp),
            )
        }
    }
}
