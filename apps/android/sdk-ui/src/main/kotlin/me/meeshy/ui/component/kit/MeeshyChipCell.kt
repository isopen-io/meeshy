package me.meeshy.ui.component.kit

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.AnimationSpec
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.tween
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.interaction.collectIsHoveredAsState
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.toggleableState
import androidx.compose.ui.state.ToggleableState
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyControlSize
import me.meeshy.ui.theme.MeeshyIconSize
import me.meeshy.ui.theme.MeeshyMediaChromeColors
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * **Une puce touchable** (K04) : sa capsule, son geste, son nom, son rôle. Un voile plat, jamais de verre ni de liseré
 * (loi 1) ; le texte grandit avec la taille de police du système et la capsule avec lui, sur une ligne.
 *
 * Elle ne se recompose que si l'une de ses VALEURS change : la puce, son état courant, la tenue de la rangée. Tout ce qui
 * bouge sous le doigt (appui, survol) se joue en phase de dessin, jamais en recomposition ; seul le fondu de 200 ms de la
 * courante recompose les deux puces qui changent d'état.
 *
 * [onActivate] reçoit la puce touchée : la loi du toucher et l'haptique vivent dans la rangée, qui garde la sélection à
 * jour sans la passer aux cellules (sans quoi chaque changement les recomposerait toutes).
 */
@Composable
internal fun <T> MeeshyChipCell(
    chip: MeeshyChip<T>,
    isSelected: Boolean,
    mode: MeeshyChipRowMode,
    semantics: MeeshyChipRowSemantics,
    surface: MeeshyChipRowSurface,
    size: MeeshyChipRowSize,
    enabled: Boolean,
    fillsWidth: Boolean,
    forcedPressed: Boolean,
    onActivate: (MeeshyChip<T>) -> Unit,
    modifier: Modifier = Modifier,
    chipLabel: (@Composable (chip: MeeshyChip<T>, ink: Color) -> Unit)? = null,
) {
    val isEnabled = enabled && chip.isEnabled
    val reduceMotion = LocalReduceMotion.current
    val themeInk = MeeshyTheme.tokens.textPrimary
    val themeInverse = MeeshyTheme.tokens.backgroundPrimary
    val isTinted = chip.tint != null
    val rest = remember(surface, isSelected, isEnabled, isTinted) {
        MeeshyChipRecipe.resolve(surface, isSelected, isEnabled = isEnabled, isTinted = isTinted)
    }
    val responding = remember(surface, isSelected, isEnabled, isTinted) {
        MeeshyChipRecipe.resolve(surface, isSelected, isPressed = true, isEnabled = isEnabled, isTinted = isTinted)
    }
    val access = remember(mode, semantics, chip.kind, isSelected) {
        MeeshyChipAccessibility.resolve(mode, semantics, chip.kind, isSelected)
    }

    val source = remember { MutableInteractionSource() }
    val isPressed = source.collectIsPressedAsState()
    val isHovered = source.collectIsHoveredAsState()
    val isFocused = source.collectIsFocusedAsState()

    val fade: AnimationSpec<Color> = if (reduceMotion) snap() else tween(durationMillis = MeeshyChipRecipe.TONE_FADE_MILLIS)
    val fillColor = animateColorAsState(
        targetValue = rest.fillColor(themeInk, chip.tint).copy(alpha = rest.fillOpacity),
        animationSpec = fade,
        label = "meeshyChipFill",
    )
    val ink = animateColorAsState(targetValue = rest.inkColor(themeInk, themeInverse), animationSpec = fade, label = "meeshyChipInk")
    val respondingColor = responding.fillColor(themeInk, chip.tint).copy(alpha = responding.fillOpacity)
    val ringColor = if (surface == MeeshyChipRowSurface.Theme) themeInk else MeeshyMediaChromeColors.OnMedia

    val density = LocalDensity.current
    val fontScale = density.fontScale
    val capsuleHeight = (size.heightDp * fontScale).dp
    val targetHeight = maxOf(capsuleHeight, MeeshyControlSize.minTouchTarget)
    val padding = (size.horizontalPaddingDp * fontScale).dp

    val gesture = Modifier.clickable(
        interactionSource = source,
        indication = null,
        enabled = isEnabled,
        onClickLabel = chip.hint,
        role = access.role.toComposeRole(),
        onClick = { onActivate(chip) },
    )
    val announced = Modifier.semantics(mergeDescendants = true) {
        contentDescription = chip.name
        when (access.role) {
            MeeshyChipRole.Choice, MeeshyChipRole.Tab -> selected = access.isSelected
            MeeshyChipRole.Toggle -> toggleableState = ToggleableState(access.isSelected)
            MeeshyChipRole.Button, MeeshyChipRole.Menu -> Unit
        }
    }

    Box(
        modifier = modifier
            .defaultMinSize(minWidth = MeeshyControlSize.minTouchTarget, minHeight = targetHeight)
            .then(gesture)
            .then(announced),
        contentAlignment = Alignment.Center,
    ) {
        Box(
            modifier = Modifier
                .then(if (rest.opacity < 1f) Modifier.alpha(rest.opacity) else Modifier)
                .defaultMinSize(minHeight = capsuleHeight)
                .then(if (fillsWidth) Modifier.fillMaxWidth() else Modifier)
                .drawBehind {
                    val live = if (rest.respondsToTouch && (forcedPressed || isPressed.value || isHovered.value)) respondingColor else fillColor.value
                    drawRoundRect(live, cornerRadius = CornerRadius(this.size.height / 2f))
                    if (isFocused.value) {
                        val width = MeeshyChipRecipe.FOCUS_RING_WIDTH_DP.dp.toPx()
                        val offset = MeeshyChipRecipe.FOCUS_RING_OFFSET_DP.dp.toPx() + width / 2f
                        drawRoundRect(
                            color = ringColor,
                            topLeft = Offset(-offset, -offset),
                            size = Size(this.size.width + 2f * offset, this.size.height + 2f * offset),
                            cornerRadius = CornerRadius((this.size.height + 2f * offset) / 2f),
                            style = Stroke(width = width),
                        )
                    }
                }
                .padding(horizontal = padding),
            contentAlignment = Alignment.Center,
        ) {
            Box(Modifier.clearAndSetSemantics { }) { ChipContent(chip, size, ink.value, chipLabel) }
        }
    }
}

/** Le glyphe de tête, le titre (ou le `chipLabel` de l'hôte) et le glyphe de fin, à l'encre que la recette donne à l'état. */
@Composable
private fun <T> ChipContent(
    chip: MeeshyChip<T>,
    size: MeeshyChipRowSize,
    ink: Color,
    chipLabel: (@Composable (chip: MeeshyChip<T>, ink: Color) -> Unit)?,
) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xsPlus),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        chip.icon?.let { icon ->
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = ink,
                modifier = Modifier.size(if (chip.isGlyphOnly) MeeshyIconSize.md else MeeshyIconSize.sm),
            )
        }
        if (chipLabel != null) {
            chipLabel(chip, ink)
        } else if (chip.title.isNotEmpty()) {
            Text(
                text = chip.title,
                color = ink,
                fontSize = size.fontSizeSp.sp,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        chip.trailing.icon()?.let { icon ->
            Icon(imageVector = icon, contentDescription = null, tint = ink, modifier = Modifier.size(MeeshyIconSize.xs))
        }
    }
}

/** Le glyphe de fin : la flèche d'un menu, la croix d'un retrait. */
private fun MeeshyChipTrailing.icon() = when (this) {
    MeeshyChipTrailing.None -> null
    MeeshyChipTrailing.Chevron -> MeeshyIcons.ChevronDown
    MeeshyChipTrailing.Remove -> MeeshyIcons.Close
}

/** Le rôle que Compose annonce : un choix est un bouton radio, une bascule une case, un menu une liste déroulante. */
private fun MeeshyChipRole.toComposeRole(): Role = when (this) {
    MeeshyChipRole.Choice -> Role.RadioButton
    MeeshyChipRole.Toggle -> Role.Checkbox
    MeeshyChipRole.Tab -> Role.Tab
    MeeshyChipRole.Button -> Role.Button
    MeeshyChipRole.Menu -> Role.DropdownList
}
