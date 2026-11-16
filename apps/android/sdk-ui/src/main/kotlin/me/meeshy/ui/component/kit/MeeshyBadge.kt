package me.meeshy.ui.component.kit

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.accessibility.decorative
import me.meeshy.ui.accessibility.meeshyTapTarget
import me.meeshy.ui.theme.MeeshyMotion
import me.meeshy.ui.theme.MeeshyMotionRecipe
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme

private const val LIVE_DOT_LOW_ALPHA = 0.35f

/** L'encre de sens d'une pastille : un sens, jamais une décoration ; [tint] la remplace sans changer ce que dit [kind]. */
@Composable
private fun badgeBase(kind: MeeshyBadgeKind, tint: Color?): Color {
    val tokens = MeeshyTheme.tokens
    return tint ?: when (kind) {
        MeeshyBadgeKind.Neutral -> tokens.textSecondary
        MeeshyBadgeKind.Accent -> MeeshyPalette.Indigo500
        MeeshyBadgeKind.Ok -> tokens.success
        MeeshyBadgeKind.Warn -> tokens.warning
        MeeshyBadgeKind.Err -> tokens.error
    }
}

private fun MeeshyBadgeContent.visibleText(): String? = when (this) {
    is MeeshyBadgeContent.Label -> text
    is MeeshyBadgeContent.Count -> if (of != null) MeeshyBadgeCount.quota(count, of) else MeeshyBadgeCount.text(count, cap)
    is MeeshyBadgeContent.Code -> text
    is MeeshyBadgeContent.Ordinal -> rank.toString()
    is MeeshyBadgeContent.Time -> text
    MeeshyBadgeContent.Glyph -> ""
}

/**
 * **La pastille qui annote sans commander** (K41) : un mot, un compte, un code, un rang, une heure ou un glyphe seul, sur une
 * surface, un genre et une hauteur. Un compte à zéro ne rend rien et ne prend aucune place ; au-delà du plafond elle écrit
 * « 99+ » et la voix dit le vrai nombre. [MeeshyBadgeSurface.Glass] rend ici la surface tonale (aucun flou sur Android).
 *
 * Sans [onPress] elle est inerte : ni cible ni rôle. Avec lui, c'est un bouton dont la cible fait 48 dp et déborde sans changer
 * l'encombrement. L'hôte traduit sa donnée en mot ou en nombre avant d'appeler : aucune signature ne nomme un rang, un cercle,
 * un pays ni un message. [label] est le nom dit, obligatoire pour un glyphe seul. Jumeau iOS : `MeeshyBadge`.
 */
@Composable
public fun MeeshyBadge(
    content: MeeshyBadgeContent,
    modifier: Modifier = Modifier,
    leading: MeeshyBadgeLeading = MeeshyBadgeLeading.None,
    surface: MeeshyBadgeSurface = MeeshyBadgeSurface.Tonal,
    kind: MeeshyBadgeKind = MeeshyBadgeKind.Neutral,
    tint: Color? = null,
    size: MeeshyBadgeSize = MeeshyBadgeSize.S22,
    shape: MeeshyBadgeShape = MeeshyBadgeShape.Capsule,
    lineLimit: Int? = 1,
    isCurrent: Boolean = false,
    isStale: Boolean = false,
    enabled: Boolean = true,
    label: String? = null,
    pressed: Boolean? = null,
    onPress: (() -> Unit)? = null,
) {
    val text = content.visibleText() ?: return
    val interaction = remember { MutableInteractionSource() }
    val livePressed = interaction.collectIsPressedAsState().value
    val isMultiLine = lineLimit == null || lineLimit > 1
    val values = MeeshyBadgeRecipe.resolve(
        surface, kind, size, shape, content.shape, isMultiLine, isCurrent, isStale,
        isInteractive = onPress != null, isPressed = pressed ?: livePressed, isEnabled = enabled,
    )
    val base = badgeBase(kind, tint)
    val ink = if (values.surface == MeeshyBadgeSurface.Solid) MeeshyTheme.tokens.backgroundPrimary else base
    val corners = values.bubbleCornersDp
    val clipShape = if (corners != null) {
        RoundedCornerShape(topStart = corners[0].dp, topEnd = corners[1].dp, bottomEnd = corners[2].dp, bottomStart = corners[3].dp)
    } else {
        RoundedCornerShape(values.cornerRadiusDp.dp)
    }
    val spoken = label ?: if (content is MeeshyBadgeContent.Count && content.of == null) MeeshyBadgeCount.spoken(content.count).toString() else text
    val outer = modifier
        .let { if (onPress != null) it.meeshyTapTarget() else it }
        .graphicsLayer { scaleX = values.scale; scaleY = values.scale }
        .alpha(values.opacity)
        .let { m ->
            if (onPress != null) {
                m.clickable(interactionSource = interaction, indication = null, enabled = enabled, role = Role.Button, onClick = onPress)
            } else {
                m
            }
        }
        .semantics(mergeDescendants = true) {
            contentDescription = spoken
            if (onPress != null) role = Role.Button
        }
    Box(modifier = outer, contentAlignment = Alignment.Center) {
        val sizing = if (values.isDisc) Modifier.size(values.heightDp.dp) else Modifier.heightIn(min = values.heightDp.dp).widthIn(min = values.heightDp.dp)
        Row(
            modifier = sizing
                .let { if (values.fillsWidth) it.fillMaxWidth() else it }
                .clip(clipShape)
                .background(if (values.surface == MeeshyBadgeSurface.Solid) base else base.copy(alpha = values.tonalAlpha))
                .let { if (values.outlineDp > 0f) it.border(values.outlineDp.dp, base, clipShape) else it }
                .let { if (values.hasAccentBorder) it.border(2.dp, MeeshyPalette.Indigo500, clipShape) else it }
                .padding(horizontal = if (values.isDisc) 0.dp else (values.heightDp / 3).dp),
            horizontalArrangement = Arrangement.spacedBy(MeeshyBadgeRecipe.LEADING_GAP_DP.dp, Alignment.CenterHorizontally),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            BadgeLeading(leading, ink, values.glyphDp)
            if (text.isNotEmpty()) {
                Text(
                    text = text,
                    color = ink,
                    fontSize = values.textSp.sp,
                    fontWeight = if (content is MeeshyBadgeContent.Count) FontWeight.ExtraBold else FontWeight.Bold,
                    fontFeatureSettings = if (values.usesTabularFigures) "tnum" else null,
                    maxLines = lineLimit ?: Int.MAX_VALUE,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

@Composable
private fun BadgeLeading(leading: MeeshyBadgeLeading, ink: Color, glyphDp: Int) {
    when (leading) {
        MeeshyBadgeLeading.None -> Unit
        is MeeshyBadgeLeading.Icon -> Icon(leading.icon, contentDescription = null, tint = ink, modifier = Modifier.size(glyphDp.dp).decorative())
        MeeshyBadgeLeading.Dot -> Box(Modifier.size(MeeshyBadgeRecipe.DOT_DP.dp).background(ink, CircleShape).decorative())
        MeeshyBadgeLeading.LiveDot -> {
            val reduce = LocalReduceMotion.current
            val alpha = if (reduce) {
                1f
            } else {
                rememberInfiniteTransition(label = "badge-live-dot").animateFloat(
                    initialValue = 1f,
                    targetValue = LIVE_DOT_LOW_ALPHA,
                    animationSpec = infiniteRepeatable(tween(durationMillis = MeeshyMotionRecipe.PULSE_MILLIS, easing = LinearEasing), RepeatMode.Reverse),
                    label = "badge-live-dot-alpha",
                ).value
            }
            Box(Modifier.size(MeeshyBadgeRecipe.DOT_DP.dp).alpha(alpha).background(ink, CircleShape).decorative())
        }
    }
}

/**
 * L'ancre de coin d'une pastille : posée au coin de [content] (avatar, vignette, porte), à un quart de sa hauteur vers
 * l'extérieur, avec un détourage de 3 dp à la couleur [cutout] du fond de l'hôte. Elle grandit vers l'extérieur, jamais sur le
 * visage. Pendant Android de `.meeshyBadge(alignment:cutout:)` : un conteneur, car Compose ne mesure pas l'hôte dans un modificateur.
 */
@Composable
public fun MeeshyBadgeAnchor(
    cutout: Color,
    badge: @Composable () -> Unit,
    modifier: Modifier = Modifier,
    alignment: Alignment = Alignment.TopEnd,
    size: MeeshyBadgeSize = MeeshyBadgeSize.S18,
    content: @Composable () -> Unit,
) {
    val offset = MeeshyBadgeRecipe.anchorOffsetDp(size).dp
    val (dx, dy) = when (alignment) {
        Alignment.TopEnd -> offset to -offset
        Alignment.TopStart -> -offset to -offset
        Alignment.BottomEnd -> offset to offset
        Alignment.BottomStart -> -offset to offset
        else -> 0.dp to 0.dp
    }
    Box(modifier) {
        content()
        Box(
            Modifier
                .align(alignment)
                .offset(x = dx, y = dy)
                .background(cutout, CircleShape)
                .padding(MeeshyBadgeRecipe.CUTOUT_DP.dp),
        ) { badge() }
    }
}
