package me.meeshy.ui.component.chrome

import androidx.compose.animation.core.EaseOutBack
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import androidx.compose.ui.util.lerp
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** One action in the [MeeshyMenuFab] — an icon, a label, an accent colour, and an
 *  optional unread/pending badge. Opaque data so the atom stays product-agnostic. */
public data class RadialMenuItem(
    val icon: ImageVector,
    val label: String,
    val color: Color,
    val badgeCount: Int = 0,
    val onSelect: () -> Unit,
)

/**
 * The floating action menu (parity plan §4.2 "menu radial"). The iOS `RootView`
 * implements it as a **vertical staggered action stack** above the button, not a
 * geometric arc — ported faithfully here: tapping the gradient FAB expands the six
 * items upward with the signature stagger (scale 0.3→1, fade 0→1, rotation −30°→0°,
 * `0.04 × index` delay). Each item is a coloured circle + label chip + optional badge.
 *
 * SDK-pure: [items] carry opaque icons/colours/actions; the atom owns only its
 * open/closed state and the animation.
 */
@Composable
public fun MeeshyMenuFab(
    items: List<RadialMenuItem>,
    modifier: Modifier = Modifier,
    fabIcon: ImageVector = Icons.Filled.Add,
) {
    var expanded by remember { mutableStateOf(false) }
    val fabRotation by animateFloatAsState(
        targetValue = if (expanded) 45f else 0f,
        animationSpec = tween(260, easing = EaseOutBack),
        label = "menu-fab-rotation",
    )

    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.End,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md, Alignment.Bottom),
    ) {
        // Rendered top→bottom in reverse so item[0] sits just above the FAB, yet the
        // stagger keys off the original index (item[0] pops first — iOS parity).
        for (index in items.indices.reversed()) {
            val item = items[index]
            val progress by animateFloatAsState(
                targetValue = if (expanded) 1f else 0f,
                animationSpec = tween(
                    durationMillis = 260,
                    delayMillis = if (expanded) index * 40 else 0,
                    easing = EaseOutBack,
                ),
                label = "menu-item-$index",
            )
            if (progress > 0.01f) {
                MenuItemRow(
                    item = item,
                    modifier = Modifier.graphicsLayer {
                        val scale = lerp(0.3f, 1f, progress)
                        scaleX = scale
                        scaleY = scale
                        alpha = progress.coerceIn(0f, 1f)
                        rotationZ = lerp(-30f, 0f, progress)
                        transformOrigin = androidx.compose.ui.graphics.TransformOrigin(1f, 0.5f)
                    },
                )
            }
        }

        FloatingGradientFab(
            onClick = { expanded = !expanded },
            icon = fabIcon,
            contentDescription = null,
            modifier = Modifier.graphicsLayer { rotationZ = fabRotation },
        )
    }
}

@Composable
private fun MenuItemRow(item: RadialMenuItem, modifier: Modifier = Modifier) {
    val tokens = MeeshyTheme.tokens
    Row(modifier = modifier, verticalAlignment = Alignment.CenterVertically) {
        Box(
            modifier = Modifier
                .clip(RoundedCornerShape(MeeshyRadius.pill))
                .background(tokens.backgroundSecondary)
                .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.xs),
        ) {
            Text(
                text = item.label,
                style = MaterialTheme.typography.labelLarge,
                color = tokens.textPrimary,
            )
        }
        Spacer(Modifier.width(MeeshySpacing.md))
        Box(contentAlignment = Alignment.Center) {
            Box(
                modifier = Modifier
                    .size(46.dp)
                    .clip(CircleShape)
                    .background(item.color),
                contentAlignment = Alignment.Center,
            ) {
                Icon(imageVector = item.icon, contentDescription = item.label, tint = MeeshyPalette.White)
            }
            if (item.badgeCount > 0) {
                Box(
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .size(18.dp)
                        .clip(CircleShape)
                        .background(MeeshyPalette.ErrorStrong),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = if (item.badgeCount > 9) "9+" else item.badgeCount.toString(),
                        style = MaterialTheme.typography.labelSmall,
                        color = MeeshyPalette.White,
                    )
                }
            }
        }
    }
}
