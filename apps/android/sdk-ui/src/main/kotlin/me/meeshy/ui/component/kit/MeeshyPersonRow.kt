package me.meeshy.ui.component.kit

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme

private const val GHOST_GLYPH_SHARE = 0.4

/**
 * **La rangée de personne** (K39) : avatar, nom, une ligne dessous, une pastille de niveau, une méta et un accessoire de fin.
 * Partout où l'on liste des gens, c'est elle ; seuls changent les mots et ce qu'on pose à la fin.
 *
 * Agnostique : des mots, une icône et deux emplacements (`avatar`, `trailing`). Elle ne dessine ni présence ni anneau — l'hôte
 * les met dans `avatar`, selon sa propre loi — et ne connaît ni cercle, ni rôle, ni distance. La partie gauche est UN élément
 * (une phrase : nom, niveau, ligne, méta d'un trait, sélection) ; l'accessoire de fin garde sa cible (44 au moins) et son nom.
 * Sans [onPress], la rangée est un texte : une sélection sans geste de l'hôte se DIT (« sélectionné »), elle ne se touche pas.
 * Jumeau iOS : `MeeshyPersonRow`.
 */
@Composable
@Suppress("LongParameterList", "LongMethod", "CyclomaticComplexMethod")
public fun MeeshyPersonRow(
    title: String,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
    meta: String? = null,
    metaDetail: String? = null,
    levelIcon: ImageVector? = null,
    levelLabel: String? = null,
    selection: MeeshyPersonRowSelection = MeeshyPersonRowSelection.None,
    selectedLabel: String? = null,
    outfit: MeeshyPersonRowOutfit = MeeshyPersonRowOutfit.Normal,
    size: MeeshyPersonRowSize = MeeshyPersonRowSize.Regular,
    showsDivider: Boolean = true,
    label: String? = null,
    onPress: (() -> Unit)? = null,
    avatar: (@Composable () -> Unit)? = null,
    trailing: (@Composable () -> Unit)? = null,
) {
    val tokens = MeeshyTheme.tokens
    val source = remember { MutableInteractionSource() }
    val isPressed by source.collectIsPressedAsState()
    val textScale = LocalDensity.current.fontScale.toDouble()
    val values = MeeshyPersonRowRecipe.resolve(size, outfit, selection, hasPress = onPress != null, isPressed = isPressed, textScale = textScale)
    val ink = if (values.isMutedText) tokens.textMuted else tokens.textPrimary
    val ghostInk = tokens.textMuted
    val metaSaid = listOfNotNull(meta, metaDetail).joinToString(" ").ifEmpty { null }
    val said = label ?: MeeshyPersonRowRecipe.spokenLabel(listOf(title, levelLabel, subtitle, metaSaid, if (values.isSelected) selectedLabel else null))
    val press = if (values.isPressable && onPress != null) {
        Modifier.clickable(interactionSource = source, indication = null, role = Role.Button, onClick = onPress)
    } else {
        Modifier
    }
    Column(modifier.fillMaxWidth()) {
        Row(
            Modifier
                .fillMaxWidth()
                .heightIn(min = maxOf(values.rowHeight, MeeshyPersonRowRecipe.MINIMUM_TARGET.takeIf { values.isPressable } ?: 0.0).dp)
                .background(tokens.textPrimary.copy(alpha = values.pressVeil.toFloat()))
                .padding(start = values.leadingMargin.dp, end = values.trailingMargin.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Row(
                Modifier.weight(1f).then(press).semantics(mergeDescendants = true) {
                    contentDescription = said
                    if (values.showsSelectionMark) selected = values.isSelected
                },
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(values.avatarGap.dp),
            ) {
                Box(Modifier.size(values.avatarSize.dp).alpha(values.avatarOpacity.toFloat()), contentAlignment = Alignment.Center) {
                    if (values.isAvatarGhost) {
                        Box(
                            Modifier.size(values.avatarSize.dp).drawBehind {
                                drawCircle(ghostInk, style = Stroke(1.5.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(6.dp.toPx(), 4.dp.toPx()))))
                            },
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(MeeshyIcons.Person, contentDescription = null, tint = ghostInk, modifier = Modifier.size((values.avatarSize * GHOST_GLYPH_SHARE).dp))
                        }
                    } else {
                        avatar?.invoke()
                    }
                }
                Column(Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text(title, color = ink, fontSize = values.titleFontSize.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
                        if (levelIcon != null) {
                            Icon(levelIcon, contentDescription = null, tint = ink, modifier = Modifier.size(values.titleAccessorySize.dp))
                        }
                    }
                    if (subtitle != null) {
                        Text(subtitle, color = tokens.textSecondary, fontSize = values.subtitleFontSize.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                    if (values.metaBelowSubtitle) MetaBlock(meta, metaDetail, values, Alignment.Start)
                }
                if (!values.metaBelowSubtitle) MetaBlock(meta, metaDetail, values, Alignment.End)
                if (values.showsSelectionMark) SelectionMark(values.selectionShape, values.isSelected)
            }
            if (trailing != null) {
                Box(
                    Modifier
                        .padding(start = values.avatarGap.dp)
                        .sizeIn(minWidth = MeeshyPersonRowRecipe.MINIMUM_TARGET.dp, minHeight = MeeshyPersonRowRecipe.MINIMUM_TARGET.dp)
                        .alpha(values.trailingOpacity.toFloat()),
                    contentAlignment = Alignment.Center,
                ) { trailing() }
            }
        }
        if (showsDivider && values.showsDivider) {
            Box(Modifier.padding(start = values.dividerInset.dp).fillMaxWidth().height(1.dp).background(tokens.hairline))
        }
    }
}

@Composable
private fun MetaBlock(meta: String?, metaDetail: String?, values: MeeshyPersonRowValues, alignment: Alignment.Horizontal) {
    if (meta == null && metaDetail == null) return
    val tokens = MeeshyTheme.tokens
    Column(horizontalAlignment = alignment) {
        if (meta != null) Text(meta, color = tokens.textPrimary, fontSize = values.metaFontSize.sp, fontWeight = FontWeight.Bold, maxLines = 1)
        if (metaDetail != null) Text(metaDetail, color = tokens.textSecondary, fontSize = values.metaDetailFontSize.sp, maxLines = 1)
    }
}

@Composable
private fun SelectionMark(shape: MeeshyPersonRowSelectionShape?, isSelected: Boolean) {
    val tokens = MeeshyTheme.tokens
    val fill = if (isSelected) MeeshyPalette.Indigo500 else Color.Transparent
    Box(
        Modifier.size(22.dp).background(fill, CircleShape).border(BorderStroke(1.5.dp, if (isSelected) MeeshyPalette.Indigo500 else tokens.textMuted), CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        if (isSelected && shape == MeeshyPersonRowSelectionShape.Check) {
            Icon(MeeshyIcons.Check, contentDescription = null, tint = Color.White, modifier = Modifier.size(14.dp))
        } else if (isSelected) {
            Box(Modifier.size(8.dp).background(Color.White, CircleShape))
        }
    }
}
