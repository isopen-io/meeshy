package me.meeshy.ui.component.chrome

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.sdk.model.chrome.CollapsibleHeaderMetrics
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.theme.MeeshyGradients
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.NunitoFontFamily

/** Layout constants for [CollapsibleHeader] — parity with iOS `CollapsibleHeader`. */
object CollapsibleHeaderDefaults {
    val ExpandedHeight = CollapsibleHeaderMetrics.EXPANDED_HEIGHT.dp
    val CollapsedHeight = CollapsibleHeaderMetrics.COLLAPSED_HEIGHT.dp
    val AccessoryCollapsedHeight = CollapsibleHeaderMetrics.ACCESSORY_COLLAPSED_HEIGHT.dp
    val CollapseThreshold = CollapsibleHeaderMetrics.COLLAPSE_THRESHOLD.dp
}

/**
 * Entree historique des hotes a progression deja calculee (Feed, Chats) : delegue a la forme complete.
 * [scrollProgress] 0..1 equivaut a un decalage de `-progress * 60` dp.
 */
@Composable
fun CollapsibleHeader(
    title: String,
    scrollProgress: Float,
    modifier: Modifier = Modifier,
    windowInsets: WindowInsets = WindowInsets.statusBars,
    actionsVisible: Boolean = true,
    actions: @Composable RowScope.() -> Unit = {},
) {
    CollapsibleHeader(
        title = title,
        scrollOffsetDp = -scrollProgress.coerceIn(0f, 1f) * CollapsibleHeaderMetrics.COLLAPSE_THRESHOLD,
        modifier = modifier,
        windowInsets = windowInsets,
        actionsVisible = actionsVisible,
        actions = actions,
    )
}

/**
 * En-tete repliable, pendant de l'iOS `CollapsibleHeader` : 64 -> 44 dp, titre 24 -> 17, retour en
 * disque de verre, sous-titre, slots `leading` / `titleView` / `centerReveal` / `accessory` et
 * accessoire de titre revele entre 78 et 148 dp.
 *
 * [scrollOffsetDp] suit la convention iOS : 0 au repos, NEGATIF quand le contenu a defile. Les couleurs
 * viennent de l'appelant ; sans [titleColor] le titre prend le degrade de marque.
 */
@Composable
fun CollapsibleHeader(
    title: String,
    scrollOffsetDp: Float,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
    onBack: (() -> Unit)? = null,
    titleColor: Color = Color.Unspecified,
    backArrowColor: Color = MeeshyPalette.Indigo500,
    backgroundColor: Color = MeeshyTheme.tokens.backgroundSecondary,
    windowInsets: WindowInsets = WindowInsets.statusBars,
    leading: (@Composable () -> Unit)? = null,
    titleView: (@Composable () -> Unit)? = null,
    centerReveal: (@Composable () -> Unit)? = null,
    accessory: (@Composable () -> Unit)? = null,
    titleAccessory: (@Composable (reveal: Float) -> Unit)? = null,
    actionsVisible: Boolean = true,
    actions: @Composable RowScope.() -> Unit = {},
) {
    val m = CollapsibleHeaderMetrics
    val progress = m.progress(scrollOffsetDp)
    val inlineReveal = if (titleAccessory != null) m.inlineAccessoryReveal(scrollOffsetDp) else 0f
    val hasReveal = centerReveal != null
    val height = m.headerHeight(
        progress,
        m.effectiveCollapsedHeight(hasReveal, titleAccessory != null, inlineReveal),
    ).dp
    val revealOpacity = m.revealOpacity(progress)
    val reduceMotion = LocalReduceMotion.current
    val textColor = if (titleColor == Color.Unspecified) MeeshyTheme.tokens.textSecondary else titleColor
    val actionsAlpha by animateFloatAsState(
        targetValue = if (actionsVisible) 1f else 0f,
        animationSpec = tween(ScrollMotionVisibility.FADE_DURATION_MS),
        label = "collapsibleHeaderActionsAlpha",
    )

    Column(
        modifier
            .fillMaxWidth()
            .background(headerBrush(backgroundColor))
            .windowInsetsPadding(windowInsets),
    ) {
        Box(Modifier.fillMaxWidth().height(height)) {
            if (titleAccessory != null) {
                Box(
                    Modifier
                        .fillMaxWidth()
                        .align(Alignment.CenterStart)
                        .graphicsLayer { alpha = inlineReveal },
                ) {
                    if (inlineReveal > 0f) titleAccessory(inlineReveal)
                }
            }
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .align(if (hasReveal) Alignment.Center else Alignment.BottomStart)
                    .padding(horizontal = m.BAR_HORIZONTAL_PADDING.dp)
                    .padding(bottom = m.titleBottomPaddingDp(progress).dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                if (onBack != null) {
                    HeaderBackButton(
                        onClick = onBack,
                        arrowSizeDp = m.backArrowSizeDp(progress),
                        tint = backArrowColor,
                        modifier = Modifier.padding(start = m.LEADING_BACK_INSET.dp, end = m.TITLE_ACTIONS_GAP.dp),
                    )
                }
                if (leading != null) {
                    Box(
                        Modifier
                            .padding(start = if (onBack != null) 0.dp else 8.dp)
                            .graphicsLayer {
                                val scale = m.leadingScale(progress)
                                scaleX = scale
                                scaleY = scale
                                transformOrigin = TransformOrigin(0f, 0.5f)
                            },
                    ) { leading() }
                }
                Column(
                    Modifier
                        .weight(1f)
                        .padding(start = if (onBack != null) 0.dp else 16.dp)
                        .graphicsLayer { alpha = 1f - inlineReveal }
                        .then(if (inlineReveal > 0.5f) Modifier.clearAndSetSemantics { } else Modifier),
                ) {
                    if (titleView != null) {
                        Box(
                            Modifier.graphicsLayer {
                                val scale = m.titleViewScale(progress)
                                scaleX = scale
                                scaleY = scale
                                transformOrigin = TransformOrigin(0f, 0.5f)
                            },
                        ) { titleView() }
                    } else {
                        HeaderTitleText(title, titleColor, m.titleSizeSp(progress), m.isTitleBold(progress))
                    }
                    if (subtitle != null && m.showExpandedSubtitle(progress)) {
                        Text(
                            text = subtitle,
                            color = textColor.copy(alpha = 0.6f),
                            fontSize = m.expandedSubtitleSizeSp(progress).sp,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.graphicsLayer { alpha = m.expandedSubtitleAlpha(progress) },
                        )
                    }
                }
                if (subtitle != null && m.showCollapsedSubtitle(progress)) {
                    Text(
                        text = subtitle,
                        color = textColor.copy(alpha = 0.5f),
                        fontSize = 12.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier
                            .padding(start = MeeshySpacing.sm)
                            .graphicsLayer { alpha = m.collapsedSubtitleAlpha(progress) },
                    )
                }
                Row(
                    modifier = Modifier
                        .padding(start = m.TITLE_ACTIONS_GAP.dp, end = m.TRAILING_ACTIONS_INSET.dp)
                        .graphicsLayer { alpha = actionsAlpha },
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
                    content = actions,
                )
            }
            if (centerReveal != null) {
                val slide = CollapsibleHeaderMotion.revealSlideDp(m.revealOffsetDp(progress), reduceMotion)
                Box(
                    Modifier
                        .align(Alignment.Center)
                        .padding(horizontal = 48.dp)
                        .graphicsLayer {
                            alpha = revealOpacity
                            translationY = slide.dp.toPx()
                        }
                        .then(if (revealOpacity < 0.5f) Modifier.clearAndSetSemantics { } else Modifier),
                ) { centerReveal() }
            }
        }
        accessory?.invoke()
        Box(
            Modifier
                .fillMaxWidth()
                .height(1.dp)
                .background(MeeshyTheme.tokens.inputBorder.copy(alpha = CollapsibleHeaderMotion.dividerAlpha(progress))),
        )
    }
}

@Composable
private fun HeaderTitleText(title: String, titleColor: Color, sizeSp: Float, bold: Boolean) {
    val style = TextStyle(
        fontFamily = NunitoFontFamily,
        fontSize = sizeSp.sp,
        fontWeight = if (bold) FontWeight.Bold else FontWeight.SemiBold,
        color = titleColor,
    )
    Text(
        text = title,
        style = if (titleColor == Color.Unspecified) style.copy(brush = MeeshyGradients.brand) else style,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
        modifier = Modifier.semantics { heading() },
    )
}

/** Surface de l'en-tete : teinte opaque en haut, transparente au bord bas (le contenu passe dessous). */
private fun headerBrush(base: Color): Brush = Brush.verticalGradient(
    0f to base.copy(alpha = 0.9f),
    0.5f to base.copy(alpha = 0.7f),
    1f to base.copy(alpha = 0f),
)

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
