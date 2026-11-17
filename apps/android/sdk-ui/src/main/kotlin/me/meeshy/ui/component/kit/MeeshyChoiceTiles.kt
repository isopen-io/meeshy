package me.meeshy.ui.component.kit

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.disabled
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.accessibility.decorative
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme

private const val TINT_FILL_ALPHA = 0.16f
private const val CHECK_MILLIS = 160
private const val ICON_SHARE = 0.5f

/**
 * **Les tuiles de choix** (K47) : choisir une valeur parmi quelques-unes. Une tuile choisit, elle ne déclenche rien — toucher
 * change [selection] (par [onSelect]) et rien d'autre, la suite appartient au bouton de l'écran. Le choix se marque par TROIS
 * signes à la fois : un bord de 2, un fond teinté, une coche de coin — jamais par la couleur seule.
 *
 * La sélection est à l'hôte, entière (une valeur ou un ensemble) : [onSelect] reçoit l'identifiant à ajouter ou à retirer.
 * En sélection simple, retoucher le choix courant ne fait rien, sauf si [allowsEmpty] permet de n'avoir aucun choix. En
 * sélection multiple, au plafond [maxSelected], les tuiles libres s'éteignent. Une tuile verrouillée dit sa raison à la voix
 * et la rend par [onLockedPress] ; une tuile éteinte ne répond pas. Chaque tuile est UN élément (radio en sélection simple, case en sélection
 * multiple). Jumeau iOS : `MeeshyChoiceTiles`.
 */
@Composable
@Suppress("LongParameterList")
public fun MeeshyChoiceTiles(
    items: List<MeeshyChoiceItem>,
    selection: MeeshyChoiceSelection,
    onSelect: (String) -> Unit,
    modifier: Modifier = Modifier,
    content: MeeshyChoiceContent = MeeshyChoiceContent.Option,
    format: MeeshyChoiceFormat = MeeshyChoiceFormat.Square,
    surface: MeeshyChoiceSurface = MeeshyChoiceSurface.Tonal,
    columns: Int? = null,
    tint: Color = MeeshyPalette.Indigo500,
    allowsEmpty: Boolean = false,
    maxSelected: Int? = null,
    onLockedPress: ((String) -> Unit)? = null,
) {
    val layout = MeeshyChoiceTilesRecipe.resolve(content, format, surface, columns)
    val isMultiple = selection is MeeshyChoiceSelection.Multiple
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(layout.gutterDp.dp)) {
        items.chunked(layout.columns).forEach { row ->
            Row(
                Modifier.fillMaxWidth().height(IntrinsicSize.Min),
                horizontalArrangement = Arrangement.spacedBy(layout.gutterDp.dp),
            ) {
                row.forEach { item ->
                    ChoiceTile(
                        item = item,
                        isSelected = selection.contains(item.id),
                        isOff = MeeshyChoiceTilesRecipe.isDisabled(item, selection, maxSelected),
                        outcome = { MeeshyChoiceTilesRecipe.outcome(selection, item, allowsEmpty, maxSelected) },
                        isMultiple = isMultiple,
                        content = content,
                        format = format,
                        surface = surface,
                        columns = columns,
                        tint = tint,
                        onSelect = onSelect,
                        onLockedPress = onLockedPress,
                        modifier = Modifier.weight(1f),
                    )
                }
                repeat(layout.columns - row.size) { Box(Modifier.weight(1f)) }
            }
        }
    }
}

@Composable
@Suppress("LongParameterList", "LongMethod")
private fun ChoiceTile(
    item: MeeshyChoiceItem,
    isSelected: Boolean,
    isOff: Boolean,
    outcome: () -> MeeshyChoiceOutcome,
    isMultiple: Boolean,
    content: MeeshyChoiceContent,
    format: MeeshyChoiceFormat,
    surface: MeeshyChoiceSurface,
    columns: Int?,
    tint: Color,
    onSelect: (String) -> Unit,
    onLockedPress: ((String) -> Unit)?,
    modifier: Modifier,
) {
    val tokens = MeeshyTheme.tokens
    val reduce = LocalReduceMotion.current
    val haptics = rememberMeeshyHaptics()
    val source = remember { MutableInteractionSource() }
    val isPressed by source.collectIsPressedAsState()
    val state = if (isOff && item.state !is MeeshyChoiceItemState.Locked) MeeshyChoiceItemState.Disabled else item.state
    val v = MeeshyChoiceTilesRecipe.resolve(content, format, surface, columns, isSelected, isPressed, state, reduce)
    val press by animateFloatAsState(v.pressScale, label = "choice-press")
    val check by animateFloatAsState(if (v.showsCheck) 1f else 0f, tween(CHECK_MILLIS), label = "choice-check")
    val shape = RoundedCornerShape(v.radiusDp.dp)
    val locked = item.state as? MeeshyChoiceItemState.Locked
    val borderColor = when {
        v.tintedFill -> tint
        v.isLocked -> tokens.textMuted
        else -> tokens.hairline
    }
    val fill = if (v.tintedFill) tint.copy(alpha = TINT_FILL_ALPHA) else tokens.surfaceFill
    val spoken = listOfNotNull(item.title, item.value, item.detail, locked?.reason).joinToString(", ")
    val tap = if (v.isDisabled) {
        Modifier
    } else {
        Modifier.clickable(
            interactionSource = source,
            indication = null,
            role = if (locked != null) Role.Button else if (isMultiple) Role.Checkbox else Role.RadioButton,
        ) {
            when (val result = outcome()) {
                is MeeshyChoiceOutcome.Locked -> onLockedPress?.invoke(result.id)
                is MeeshyChoiceOutcome.Select -> { haptics.selection(); onSelect(result.id) }
                is MeeshyChoiceOutcome.Deselect -> { haptics.selection(); onSelect(result.id) }
                MeeshyChoiceOutcome.Ignored -> Unit
            }
        }
    }
    Box(
        modifier
            .graphicsLayer { scaleX = press; scaleY = press }
            .alpha(v.opacity)
            .clip(shape)
            .background(fill, shape)
            .background(tokens.textPrimary.copy(alpha = v.pressVeil), shape)
            .border(v.borderDp.dp, borderColor, shape)
            .then(tap)
            .semantics(mergeDescendants = true) {
                contentDescription = spoken
                selected = isSelected && !v.isLocked && !v.isDisabled
                if (v.isDisabled) disabled()
                role = if (isMultiple) Role.Checkbox else Role.RadioButton
            }
            .heightIn(min = v.minHeightDp.dp)
            .padding(v.paddingDp.dp),
    ) {
        Column(Modifier.fillMaxWidth().align(Alignment.CenterStart), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            when {
                content == MeeshyChoiceContent.Value && item.value != null ->
                    Text(item.value, color = tokens.textPrimary, fontSize = v.valueSp.sp, fontWeight = FontWeight.ExtraBold, style = TextStyle(fontFeatureSettings = "tnum"))
                item.icon != null -> ChoiceHead(item.icon, v, tint)
            }
            Text(item.title, color = tokens.textPrimary, fontSize = v.titleSp.sp, fontWeight = FontWeight.Bold)
            item.detail?.let { Text(it, color = tokens.textSecondary, fontSize = MeeshyChoiceTilesRecipe.DETAIL_SP.sp) }
        }
        if (v.isLocked) {
            Icon(MeeshyIcons.Lock, contentDescription = null, tint = tokens.textMuted, modifier = Modifier.align(Alignment.TopEnd).size(18.dp).decorative())
        } else if (check > 0f) {
            Box(
                Modifier
                    .align(Alignment.TopEnd)
                    .size(v.checkDp.dp)
                    .graphicsLayer { alpha = check; scaleX = if (reduce) 1f else 0.6f + 0.4f * check; scaleY = if (reduce) 1f else 0.6f + 0.4f * check }
                    .background(tint, CircleShape)
                    .decorative(),
                contentAlignment = Alignment.Center,
            ) { Icon(MeeshyIcons.Check, contentDescription = null, tint = Color.White, modifier = Modifier.size(14.dp)) }
        }
    }
}

@Composable
private fun ChoiceHead(icon: ImageVector, v: MeeshyChoiceTilesValues, tint: Color) {
    val ink = if (v.invertsDisc) Color.White else tint
    val disc = if (v.invertsDisc) tint else tint.copy(alpha = TINT_FILL_ALPHA)
    Box(Modifier.size(v.headDp.dp).background(disc, CircleShape).decorative(), contentAlignment = Alignment.Center) {
        Icon(icon, contentDescription = null, tint = ink, modifier = Modifier.size((v.headDp * ICON_SHARE).dp))
    }
}
