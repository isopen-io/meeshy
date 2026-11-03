package me.meeshy.ui.component

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.boundsInRoot
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.ui.R
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyMotion
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * One flag chip of the scrubbable language bar. Pure data, opaque to the SDK.
 *
 * [isTranslatable] marks a configured language with no content yet — it reads as a
 * dimmed flag with a "+" affordance and, when tapped, requests an on-demand
 * translation instead of switching the displayed language. [isTranslating] shows the
 * request is in flight. A content chip is neither.
 */
@Immutable
data class LanguageQuickOption(
    val code: String,
    val flag: String,
    val label: String,
    val isTranslatable: Boolean = false,
    val isTranslating: Boolean = false,
)

/**
 * Horizontal flag strip — Android port of the iOS `StoryLanguageQuickBar`
 * pill, sharing the scrub contract of [EmojiQuickStrip]: the caller drives
 * [highlightedIndex] (hovered chip, scaled ×1.35 with the brand bouncy
 * spring) and collects chip bounds via [onTileBounds] for its own
 * hit-testing. The active chip (currently displayed language) reads at full
 * opacity with an accent underline; others are dimmed. The pill is a
 * background shape (never a clip) so a hovered chip can overflow it.
 */
@Composable
fun LanguageQuickStrip(
    options: List<LanguageQuickOption>,
    onSelect: (LanguageQuickOption) -> Unit,
    modifier: Modifier = Modifier,
    activeCode: String? = null,
    highlightedIndex: Int? = null,
    onTileBounds: ((Int, Rect) -> Unit)? = null,
    onOpenAll: (() -> Unit)? = null,
) {
    val scrolling = languageStripScrolls(options.size)
    Row(
        modifier = modifier.background(MeeshyTheme.tokens.backgroundSecondary, RoundedCornerShape(MeeshyRadius.pill)),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        val flags: @Composable () -> Unit = {
            Row(
                modifier = Modifier.padding(start = MeeshySpacing.sm, end = if (scrolling) MeeshySpacing.xs else 0.dp, top = MeeshySpacing.xs, bottom = MeeshySpacing.xs),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
            ) {
                options.forEachIndexed { index, option ->
                    LanguageChipTile(
                        option = option,
                        isActive = isActiveCode(option.code, activeCode),
                        isHighlighted = highlightedIndex == index,
                        onClick = { onSelect(option) },
                        onBounds = onTileBounds?.let { report -> { rect -> report(index, rect) } },
                    )
                }
            }
        }
        if (scrolling) {
            // Longue liste : ~5 drapeaux visibles, le reste défile sous un masque en fondu ; le « + » reste épinglé.
            Box(
                Modifier
                    .width(LanguageStripScrollWidth)
                    .graphicsLayer { compositingStrategy = CompositingStrategy.Offscreen }
                    .drawWithContent {
                        drawContent()
                        drawRect(
                            brush = Brush.horizontalGradient(
                                0f to Color.Black,
                                0.92f to Color.Black,
                                1f to Color.Transparent,
                            ),
                            blendMode = BlendMode.DstIn,
                        )
                    }
                    .horizontalScroll(rememberScrollState()),
            ) { flags() }
        } else {
            flags()
        }
        if (onOpenAll != null) {
            MoreLanguagesTile(
                isHighlighted = highlightedIndex == plusTileIndex(options.size),
                onClick = onOpenAll,
                onBounds = onTileBounds?.let { report -> { rect -> report(plusTileIndex(options.size), rect) } },
            )
        }
    }
}

/** Au-delà de ce nombre de drapeaux la rangée défile ; en deçà, la pilule épouse son contenu (iOS `inlineCap`). */
internal const val LANGUAGE_STRIP_INLINE_CAP: Int = 5

/** Largeur de la fenêtre défilante : ~5 drapeaux, comme la barre de réactions. */
private val LanguageStripScrollWidth = 180.dp

internal fun languageStripScrolls(count: Int): Boolean = count > LANGUAGE_STRIP_INLINE_CAP

/** Le « + » épinglé porte l'index qui suit le dernier drapeau, pour le survol du geste glissé. */
internal fun plusTileIndex(count: Int): Int = count

/** The pinned « + » of the bar (iOS `StoryLanguageQuickBar.plusChip`): opens the full language list. */
@Composable
private fun MoreLanguagesTile(isHighlighted: Boolean, onClick: () -> Unit, onBounds: ((Rect) -> Unit)?) {
    val label = stringResource(R.string.language_strip_more)
    val scale by animateFloatAsState(
        targetValue = if (isHighlighted) 1.35f else 1f,
        animationSpec = MeeshyMotion.bouncySpring(),
        label = "languagePlusScale",
    )
    Box(
        modifier = Modifier
            .padding(end = MeeshySpacing.sm)
            .size(36.dp)
            .let { base -> if (onBounds != null) base.onGloballyPositioned { onBounds(it.boundsInRoot()) } else base }
            .graphicsLayer {
                scaleX = scale
                scaleY = scale
            }
            .clip(CircleShape)
            .background(MeeshyPalette.White.copy(alpha = 0.15f))
            .clickable(onClick = onClick)
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = MeeshyIcons.Add,
            contentDescription = null,
            tint = MeeshyPalette.White.copy(alpha = 0.9f),
            modifier = Modifier.size(18.dp),
        )
    }
}

@Composable
private fun LanguageChipTile(
    option: LanguageQuickOption,
    isActive: Boolean,
    isHighlighted: Boolean,
    onClick: () -> Unit,
    onBounds: ((Rect) -> Unit)?,
) {
    val selectLabel = stringResource(R.string.language_strip_select, option.label)
    val scale by animateFloatAsState(
        targetValue = if (isHighlighted) 1.35f else 1f,
        animationSpec = MeeshyMotion.bouncySpring(),
        label = "languageChipScale",
    )
    Box(
        modifier = Modifier
            .size(36.dp)
            .let { base ->
                if (onBounds != null) base.onGloballyPositioned { onBounds(it.boundsInRoot()) } else base
            }
            .graphicsLayer {
                scaleX = scale
                scaleY = scale
                alpha = when {
                    option.isTranslatable && !isHighlighted -> 0.55f
                    isActive || isHighlighted -> 1f
                    else -> 0.55f
                }
            }
            .clip(CircleShape)
            .clickable(onClick = onClick)
            .semantics { contentDescription = selectLabel },
        contentAlignment = Alignment.Center,
    ) {
        Text(text = option.flag, fontSize = 22.sp)
        // A translatable chip (a configured language with no content yet) carries a
        // "+" affordance — "…" while its request is in flight. A content chip shows
        // the active underline instead.
        if (option.isTranslatable) {
            Text(
                text = if (option.isTranslating) "…" else "+",
                fontSize = 12.sp,
                color = MeeshyPalette.Indigo400,
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(top = 1.dp, end = 1.dp),
            )
        } else if (isActive) {
            Box(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .padding(bottom = 2.dp)
                    .size(width = 14.dp, height = 2.dp)
                    .clip(CircleShape)
                    .background(MeeshyPalette.Indigo400),
            )
        }
    }
}

/**
 * A chip is active when its language is the one currently displayed —
 * case-insensitive, matched on the BCP-47 base (`pt-BR` ↔ `pt`) so regional
 * variants stay highlighted. Mirror of iOS `StoryLanguageQuickBar.isActive`.
 */
internal fun isActiveCode(code: String, active: String?): Boolean {
    if (active == null) return false
    val lhs = code.lowercase()
    val rhs = active.lowercase()
    if (lhs == rhs) return true
    val lhsBase = lhs.substringBefore('-')
    val rhsBase = rhs.substringBefore('-')
    return lhsBase.isNotEmpty() && lhsBase == rhsBase
}
