package me.meeshy.ui.component.kit

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.hoverable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsHoveredAsState
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Icon
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import me.meeshy.ui.R
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyBorder
import me.meeshy.ui.theme.MeeshyControlSize
import me.meeshy.ui.theme.MeeshyFontSize
import me.meeshy.ui.theme.MeeshyIconSize
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** Ce que la ligne montre, hors emplacements : titre, sous-titre, accessoire, variante, filet, ton et teinte. */
@Immutable
public data class MeeshyToggleRowContent(
    val title: String,
    val subtitle: String? = null,
    val accessory: MeeshyToggleRowAccessory = MeeshyToggleRowAccessory.None,
    val kind: MeeshyToggleRowKind = MeeshyToggleRowKind.Normal,
    val showsDivider: Boolean = false,
    val tone: MeeshyGlassTone? = null,
    val tint: Color? = null,
)

/**
 * **Ce qu'on VOIT d'une ligne** (K06) : tête, titre, sous-titre, accessoire et filet, sans action ni rôle. Sert de corps
 * à [MeeshyToggleRow] et de libellé à un lien ou à un menu. Une unité « ligne + second contrôle » se compose autour.
 * [enabled] faux : encre désactivée à 62 %, aucune réponse.
 */
@Composable
public fun MeeshyToggleRowFace(
    content: MeeshyToggleRowContent,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    leading: (@Composable () -> Unit)? = null,
    titleAccessory: (@Composable () -> Unit)? = null,
    trailing: (@Composable () -> Unit)? = null,
) {
    val recipe = MeeshyToggleRowRecipe.resolve(
        accessory = content.accessory,
        kind = content.kind,
        tone = content.tone ?: LocalMeeshyGlassTone.current,
        isDark = MeeshyTheme.isDark,
        isEnabled = enabled,
        isPressed = false,
        isHovered = false,
        tint = content.tint,
    )
    val isAccessibilityScale = LocalDensity.current.fontScale >= MeeshyToggleRowRecipe.ACCESSIBILITY_FONT_SCALE
    Column(modifier = modifier.fillMaxWidth()) {
        if (content.showsDivider) {
            Box(Modifier.fillMaxWidth().height(MeeshyBorder.regular).background(recipe.dividerColor))
        }
        val lineModifier = Modifier
            .fillMaxWidth()
            .heightIn(min = recipe.minimumHeight)
            .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.xs)
        if (isAccessibilityScale) {
            Column(lineModifier, verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    LeadingSlot(leading, recipe)
                    TextColumn(content, recipe, titleAccessory)
                }
                AccessoryGroup(content.accessory, recipe, trailing)
            }
        } else {
            Row(lineModifier, verticalAlignment = Alignment.CenterVertically) {
                LeadingSlot(leading, recipe)
                TextColumn(content, recipe, titleAccessory)
                Spacer(Modifier.width(MeeshySpacing.sm))
                AccessoryGroup(content.accessory, recipe, trailing)
            }
        }
    }
}

/**
 * **La ligne de liste qui se touche tout entière** (K06) : toute la surface est la cible, [onClick] part une fois au
 * relâcher, et l'accessoire est un dessin inerte. L'hôte tient l'état (`Toggle(isOn)`, `Check(isSelected)`) et le met à
 * jour lui-même. Hauteur d'au moins 46 dp, cible tactile d'au moins 48 dp.
 */
@Composable
public fun MeeshyToggleRow(
    content: MeeshyToggleRowContent,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    haptic: MeeshyToggleRowHaptic = MeeshyToggleRowHaptic.Light,
    leading: (@Composable () -> Unit)? = null,
    titleAccessory: (@Composable () -> Unit)? = null,
    trailing: (@Composable () -> Unit)? = null,
) {
    val interactionSource = remember { MutableInteractionSource() }
    val haptics = rememberMeeshyHaptics()
    val label = MeeshyToggleRowRecipe.accessibilityLabel(content.title, content.subtitle)
    val selection = MeeshyToggleRowRecipe.valueFor(content.accessory) as? MeeshyToggleRowValue.Selected
    val spokenValue = spokenValueOf(content.accessory)
    Box(
        modifier = modifier
            .fillMaxWidth()
            .defaultMinSize(minHeight = MeeshyControlSize.minTouchTarget)
            .hoverable(interactionSource = interactionSource, enabled = enabled)
            .clickable(
                interactionSource = interactionSource,
                indication = null,
                enabled = enabled,
                role = Role.Button,
                onClick = {
                    if (haptic == MeeshyToggleRowHaptic.Light) haptics.light()
                    onClick()
                },
            )
            .semantics(mergeDescendants = true) {
                contentDescription = label
                if (selection != null) selected = selection.isSelected
                if (spokenValue != null) stateDescription = spokenValue
            },
        contentAlignment = Alignment.CenterStart,
    ) {
        MeeshyToggleRowVeil(
            interactionSource = interactionSource,
            kind = content.kind,
            tone = content.tone,
            tint = content.tint,
            enabled = enabled,
        )
        MeeshyToggleRowFace(
            content = content,
            modifier = Modifier.fillMaxWidth(),
            enabled = enabled,
            leading = leading,
            titleAccessory = titleAccessory,
            trailing = trailing,
        )
    }
}

/** La ligne dont l'emplacement de tête est une icône nue, à l'encre de la ligne. */
@Composable
public fun MeeshyToggleRow(
    title: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
    accessory: MeeshyToggleRowAccessory = MeeshyToggleRowAccessory.None,
    kind: MeeshyToggleRowKind = MeeshyToggleRowKind.Normal,
    showsDivider: Boolean = false,
    tone: MeeshyGlassTone? = null,
    tint: Color? = null,
    enabled: Boolean = true,
    haptic: MeeshyToggleRowHaptic = MeeshyToggleRowHaptic.Light,
    icon: ImageVector? = null,
) {
    val iconSlot = remember(icon) { icon?.let(::meeshyToggleRowIconSlot) }
    MeeshyToggleRow(
        content = MeeshyToggleRowContent(
            title = title,
            subtitle = subtitle,
            accessory = accessory,
            kind = kind,
            showsDivider = showsDivider,
            tone = tone,
            tint = tint,
        ),
        onClick = onClick,
        modifier = modifier,
        enabled = enabled,
        haptic = haptic,
        leading = iconSlot,
    )
}

private fun meeshyToggleRowIconSlot(icon: ImageVector): @Composable () -> Unit = { MeeshyToggleRowIcon(icon) }

@Composable
private fun MeeshyToggleRowIcon(icon: ImageVector) {
    Icon(
        imageVector = icon,
        contentDescription = null,
        modifier = Modifier.padding(end = MeeshySpacing.md).size(MeeshyIconSize.xxl),
    )
}

/** La tête de ligne : à l'encre du titre, baissée avec lui, muette pour le lecteur d'écran (le titre la nomme). */
@Composable
private fun LeadingSlot(leading: (@Composable () -> Unit)?, recipe: MeeshyToggleRowRecipe) {
    if (leading == null) return
    Box(Modifier.alpha(recipe.contentOpacity).clearAndSetSemantics {}) {
        CompositionLocalProvider(LocalContentColor provides recipe.titleColor) { leading() }
    }
}

@Composable
private fun RowScope.TextColumn(
    content: MeeshyToggleRowContent,
    recipe: MeeshyToggleRowRecipe,
    titleAccessory: (@Composable () -> Unit)?,
) {
    val subtitle = MeeshyToggleRowRecipe.visibleSubtitle(content.subtitle)
    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
            Text(
                text = content.title,
                color = recipe.titleColor,
                fontSize = MeeshyFontSize.body,
                fontWeight = FontWeight.Medium,
                modifier = Modifier.alpha(recipe.contentOpacity),
            )
            if (titleAccessory != null) {
                Box(Modifier.clearAndSetSemantics {}) { titleAccessory() }
            }
        }
        if (subtitle != null) {
            Text(text = subtitle, color = recipe.subtitleColor, fontSize = MeeshyFontSize.small)
        }
    }
}

@Composable
private fun AccessoryGroup(accessory: MeeshyToggleRowAccessory, recipe: MeeshyToggleRowRecipe, trailing: (@Composable () -> Unit)?) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
        modifier = Modifier.alpha(recipe.contentOpacity).clearAndSetSemantics {},
    ) {
        trailing?.invoke()
        AccessoryView(accessory, recipe)
    }
}

@Composable
private fun AccessoryView(accessory: MeeshyToggleRowAccessory, recipe: MeeshyToggleRowRecipe) {
    when (accessory) {
        MeeshyToggleRowAccessory.None -> Unit
        is MeeshyToggleRowAccessory.Toggle -> Switch(
            checked = accessory.isOn,
            onCheckedChange = null,
            thumbContent = EvenThumb,
            colors = SwitchDefaults.colors(
                checkedThumbColor = recipe.thumbColor,
                checkedTrackColor = recipe.trackOnColor,
                checkedBorderColor = Color.Transparent,
                uncheckedThumbColor = recipe.thumbColor,
                uncheckedTrackColor = recipe.trackOffColor,
                uncheckedBorderColor = Color.Transparent,
            ),
            modifier = Modifier.clearAndSetSemantics {},
        )
        is MeeshyToggleRowAccessory.Check -> CheckMark(isSelected = accessory.isSelected, color = recipe.accessoryColor)
        is MeeshyToggleRowAccessory.Checkbox -> Icon(
            imageVector = if (accessory.isChecked) MeeshyIcons.CheckBoxChecked else MeeshyIcons.CheckBoxBlank,
            contentDescription = null,
            modifier = Modifier.size(MeeshyToggleRowRecipe.checkboxSide),
            tint = recipe.accessoryColor,
        )
        MeeshyToggleRowAccessory.Chevron -> Icon(
            imageVector = MeeshyIcons.ChevronForward,
            contentDescription = null,
            modifier = Modifier.size(MeeshyIconSize.lg),
            tint = recipe.accessoryColor,
        )
        is MeeshyToggleRowAccessory.Value -> Text(
            text = accessory.text,
            color = recipe.accessoryColor,
            fontSize = MeeshyFontSize.label,
        )
    }
}

/**
 * Un pouce de même taille ouvert ou fermé, comme la planche (`.tg i`) et la bascule iOS : Material3 rétrécit le pouce
 * d'une bascule fermée tant qu'elle n'a pas de contenu de pouce.
 */
private val EvenThumb: @Composable () -> Unit = {}

/**
 * La coche n'existe que sur le choix retenu (loi 13) ; elle apparaît et s'efface en fondu de 200 ms, instantanément avec
 * « Réduire les animations ». Fondu d'opacité seulement : la mise en page ne s'anime pas.
 */
@Composable
private fun CheckMark(isSelected: Boolean, color: Color) {
    val reduceMotion = LocalReduceMotion.current
    AnimatedVisibility(
        visible = isSelected,
        enter = if (reduceMotion) EnterTransition.None else fadeIn(tween(MeeshyToggleRowRecipe.FADE_DURATION_MILLIS)),
        exit = if (reduceMotion) ExitTransition.None else fadeOut(tween(MeeshyToggleRowRecipe.FADE_DURATION_MILLIS)),
        label = "meeshy-toggle-row-check",
    ) {
        Icon(
            imageVector = MeeshyIcons.Check,
            contentDescription = null,
            modifier = Modifier.size(MeeshyIconSize.xl),
            tint = color,
        )
    }
}

/**
 * Le voile d'appui : l'encre de la ligne à 15 % tant que le doigt est posé, à 8 % au survol. Il déborde de
 * `MeeshySpacing.sm` de chaque côté sans changer l'encombrement, rayon `MeeshyRadius.sm`. Feuille : seul ce voile lit
 * l'état d'appui, la ligne ne se recompose pas.
 */
@Composable
private fun BoxScope.MeeshyToggleRowVeil(
    interactionSource: MutableInteractionSource,
    kind: MeeshyToggleRowKind,
    tone: MeeshyGlassTone?,
    tint: Color?,
    enabled: Boolean,
) {
    val isPressed by interactionSource.collectIsPressedAsState()
    val isHovered by interactionSource.collectIsHoveredAsState()
    val reduceMotion = LocalReduceMotion.current
    val recipe = MeeshyToggleRowRecipe.resolve(
        accessory = MeeshyToggleRowAccessory.None,
        kind = kind,
        tone = tone ?: LocalMeeshyGlassTone.current,
        isDark = MeeshyTheme.isDark,
        isEnabled = enabled,
        isPressed = isPressed,
        isHovered = isHovered,
        tint = tint,
    )
    val veilOpacity by animateFloatAsState(
        targetValue = recipe.veilOpacity,
        animationSpec = if (isPressed || reduceMotion) snap() else tween(MeeshyToggleRowRecipe.FADE_DURATION_MILLIS),
        label = "meeshy-toggle-row-veil",
    )
    val inflate = MeeshySpacing.sm
    Box(
        modifier = Modifier.matchParentSize().drawBehind {
            if (veilOpacity > 0f) {
                drawRoundRect(
                    color = recipe.veilColor.copy(alpha = veilOpacity),
                    topLeft = Offset(-inflate.toPx(), 0f),
                    size = Size(size.width + inflate.toPx() * 2f, size.height),
                    cornerRadius = CornerRadius(MeeshyRadius.sm.toPx()),
                )
            }
        },
    )
}

@Composable
private fun spokenValueOf(accessory: MeeshyToggleRowAccessory): String? {
    val on = stringResource(R.string.a11y_kit_toggle_on)
    val off = stringResource(R.string.a11y_kit_toggle_off)
    return when (val value = MeeshyToggleRowRecipe.valueFor(accessory)) {
        MeeshyToggleRowValue.None, is MeeshyToggleRowValue.Selected -> null
        is MeeshyToggleRowValue.Toggle -> if (value.isOn) on else off
        is MeeshyToggleRowValue.Text -> value.text
    }
}
