package me.meeshy.ui.component.kit

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme

/**
 * **L'action libellée** (K32) : un disque de verre (celui de K02), son mot dessous, éventuellement une valeur en pilule — UNE
 * cible, UN nom, UNE réponse au toucher. Le libellé est toujours visible : aucune action n'est un glyphe seul.
 *
 * Agnostique : des textes déjà écrits et une icône. Elle ne sait pas ce que le geste fait, ne dessine aucun fond (le disque vient
 * de `MeeshyGlassButtonFace`, mis à l'échelle) et ne confirme rien. En attente ou désactivée, ni action ni tic. La [size] vient de
 * la grille qui la range. Jumeau iOS : `MeeshyLabeledAction`.
 */
@Composable
@Suppress("LongParameterList", "LongMethod")
public fun MeeshyLabeledAction(
    title: String,
    icon: ImageVector,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    value: String? = null,
    valueKind: MeeshyLabeledActionValueKind = MeeshyLabeledActionValueKind.Accent,
    kind: MeeshyGlassButtonKind = MeeshyGlassButtonKind.Normal,
    size: MeeshyLabeledActionSize = MeeshyLabeledActionSize.S60,
    isPending: Boolean = false,
    isFeatured: Boolean = false,
    enabled: Boolean = true,
    tint: Color? = null,
    hint: String? = null,
    label: String? = null,
    pendingLabel: String? = null,
) {
    val tokens = MeeshyTheme.tokens
    val reduceMotion = LocalReduceMotion.current
    val source = remember { MutableInteractionSource() }
    val isPressed by source.collectIsPressedAsState()
    val values = remember(kind, size, isPending, isFeatured, enabled, value) {
        MeeshyLabeledActionRecipe.resolve(kind, size, isPending, isFeatured, enabled, hasValue = value != null)
    }
    val named = label ?: title
    Column(
        modifier
            .widthIn(min = values.minTargetWidth.dp)
            .heightIn(min = values.minTargetHeight.dp)
            .alpha(values.opacity.toFloat())
            .clickable(
                interactionSource = source,
                indication = null,
                enabled = values.isActionable,
                onClickLabel = hint,
                role = Role.Button,
                onClick = onClick,
            )
            .semantics(mergeDescendants = true) {
                contentDescription = named
                val state = listOfNotNull(value, if (isPending) pendingLabel else null).joinToString(", ")
                if (state.isNotEmpty()) stateDescription = state
            },
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(Modifier.size(values.diameter.dp), contentAlignment = Alignment.Center) {
            MeeshyGlassButtonFace(
                icon = icon,
                modifier = Modifier.graphicsLayer {
                    scaleX = values.faceScale.toFloat()
                    scaleY = values.faceScale.toFloat()
                }.alpha(values.glyphOpacity.toFloat()),
                kind = kind,
                size = MeeshyGlassButtonSize.S48,
                tint = tint,
                enabled = enabled,
                pressed = isPressed,
            )
            if (values.showsRing && !reduceMotion) {
                CircularProgressIndicator(Modifier.size(values.diameter.dp).clearAndSetSemantics { }, color = tokens.textSecondary, strokeWidth = 2.dp)
            }
        }
        Spacer(Modifier.height(values.labelGap.dp))
        Text(
            text = title,
            color = tokens.textPrimary,
            fontSize = values.labelFontSize.sp,
            fontWeight = FontWeight.Medium,
            textAlign = TextAlign.Center,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
        if (value != null) {
            Spacer(Modifier.height(values.valueGap.dp))
            val accent = valueKind == MeeshyLabeledActionValueKind.Accent
            Box(
                Modifier
                    .heightIn(min = values.valueHeight.dp)
                    .background(if (accent) MeeshyPalette.Indigo500 else tokens.controlFill, RoundedCornerShape(percent = 50))
                    .padding(horizontal = 8.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(value, color = if (accent) Color.White else tokens.textSecondary, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
            }
        }
    }
}

/**
 * **La grille d'actions** (K32) : colonnes égales d'au moins 76, écart 8, rangées espacées de 18, alignées en haut, sans jamais
 * laisser une action seule sur sa ligne quand on peut l'éviter ; la rangée courte est centrée. En grande police, la grille perd
 * une colonne plutôt que de couper un mot. [size] vaut pour toute la grille ; sans lui, elle suit sa largeur (56, 60 ou 64).
 */
@Composable
public fun MeeshyActionGrid(
    actions: List<@Composable (size: MeeshyLabeledActionSize) -> Unit>,
    modifier: Modifier = Modifier,
    columns: MeeshyActionColumns = MeeshyActionColumns.Adaptive(MeeshyActionGridRecipe.PHONE_MAX_COLUMNS),
    size: MeeshyLabeledActionSize? = null,
) {
    val textScale = LocalDensity.current.fontScale.toDouble()
    BoxWithConstraints(modifier.fillMaxWidth()) {
        val values = MeeshyActionGridRecipe.resolve(maxWidth.value.toDouble(), actions.size, columns, textScale)
        val disc = size ?: values.size
        Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(MeeshyActionGridRecipe.ROW_GAP.dp)) {
            var index = 0
            values.rows.forEach { rowCount ->
                val row = actions.subList(index, index + rowCount)
                index += rowCount
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(MeeshyActionGridRecipe.COLUMN_GAP.dp, Alignment.CenterHorizontally),
                    verticalAlignment = Alignment.Top,
                ) {
                    row.forEach { action -> Box(Modifier.widthIn(max = values.columnWidth.dp)) { action(disc) } }
                }
            }
        }
    }
}
