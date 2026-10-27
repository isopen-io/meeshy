package me.meeshy.app.chat

import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.selection.toggleable
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.layout
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import me.meeshy.feature.chat.R
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing

/** La largeur que la coche prend à gauche de la rangée (iOS `selectionCircleDiameter` × 1,8). */
private val SELECTION_GUTTER = 36.dp
private val SELECTION_CIRCLE = 22.dp
private const val SELECTION_SLIDE_MS = 200

/**
 * Le cadre d'une rangée en mode sélection (#13294, iOS `BubbleSwipeContainer`) : la coche entre à
 * gauche et la rangée glisse d'autant, un toucher n'importe où coche ou décoche (la bulle ne reçoit
 * plus ni toucher, ni appui long, ni glissé).
 *
 * La largeur animée n'est lue qu'à la MISE EN PAGE et la coche qu'au DESSIN : l'animation ne
 * recompose ni la bulle ni la rangée. L'arbre garde la même forme dans et hors du mode : la
 * bulle (lecteur audio, aperçu déplié…) ne perd pas son état quand le mode s'ouvre.
 */
@Composable
internal fun SelectableRowFrame(
    selecting: Boolean,
    selected: Boolean,
    accentColor: Color,
    onToggle: () -> Unit,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    val reduceMotion = LocalReduceMotion.current
    val gutter = animateDpAsState(
        targetValue = if (selecting) SELECTION_GUTTER else 0.dp,
        animationSpec = tween(if (reduceMotion) 0 else SELECTION_SLIDE_MS),
        label = "selection-gutter",
    )
    val label = stringResource(R.string.chat_selection_toggle_message)
    Box(modifier.fillMaxWidth()) {
        Box(
            Modifier.layout { measurable, constraints ->
                val shift = gutter.value.roundToPx().coerceAtMost(constraints.maxWidth)
                val placeable = measurable.measure(
                    constraints.copy(
                        minWidth = (constraints.minWidth - shift).coerceAtLeast(0),
                        maxWidth = (constraints.maxWidth - shift).coerceAtLeast(0),
                    ),
                )
                layout(constraints.maxWidth, placeable.height) { placeable.placeRelative(shift, 0) }
            },
        ) { content() }
        if (selecting || gutter.value > 0.dp) {
            SelectionCircle(
                selected = selected,
                gutter = gutter::value,
                accentColor = accentColor,
                modifier = Modifier.align(Alignment.CenterStart),
            )
        }
        if (selecting) {
            Box(
                Modifier
                    .matchParentSize()
                    .toggleable(
                        value = selected,
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                        role = Role.Checkbox,
                        onValueChange = { onToggle() },
                    )
                    .semantics { contentDescription = label },
            )
        }
    }
}

@Composable
private fun SelectionCircle(
    selected: Boolean,
    gutter: () -> Dp,
    accentColor: Color,
    modifier: Modifier = Modifier,
) {
    val pop = animateFloatAsState(
        targetValue = if (selected) 1f else 0.92f,
        animationSpec = spring(dampingRatio = Spring.DampingRatioMediumBouncy, stiffness = Spring.StiffnessMedium),
        label = "selection-pop",
    )
    Box(
        modifier
            .padding(start = (SELECTION_GUTTER - SELECTION_CIRCLE) / 2)
            .graphicsLayer {
                alpha = (gutter().value / SELECTION_GUTTER.value).coerceIn(0f, 1f)
                scaleX = pop.value
                scaleY = pop.value
            }
            .size(SELECTION_CIRCLE),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = if (selected) MeeshyIcons.CheckCircleFilled else MeeshyIcons.RadioUnchecked,
            contentDescription = null,
            tint = if (selected) accentColor else MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
            modifier = Modifier.size(SELECTION_CIRCLE),
        )
    }
}

/**
 * La barre d'action du mode sélection (#13294, iOS `selectionToolbar`) : Annuler, Supprimer, le
 * compteur (à partir de 2), puis les sorties que la loi des actions offre ([SelectionOffer]).
 * Elle REMPLACE le composeur tant que la sélection est ouverte. [bottomClearance] relève la barre
 * au-dessus de la barre de navigation système (boutons Android 9) et des portes flottantes : sans
 * lui elle se dessinait dessous, sans toucher (#13376).
 */
@Composable
internal fun SelectionBar(
    count: Int,
    offer: SelectionOffer,
    accentColor: Color,
    onCancel: () -> Unit,
    onDelete: () -> Unit,
    onCopy: () -> Unit,
    onStar: () -> Unit,
    onForward: () -> Unit,
    modifier: Modifier = Modifier,
    bottomClearance: Dp = 0.dp,
) {
    ComposerGlassPlate(modifier = modifier.padding(bottom = bottomClearance)) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.xs),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        ) {
            TextButton(onClick = onCancel) {
                Text(stringResource(R.string.chat_delete_confirm_cancel), color = accentColor)
            }
            if (offer.offersDelete) {
                IconButton(onClick = onDelete, enabled = count > 0) {
                    Icon(
                        MeeshyIcons.Delete,
                        contentDescription = stringResource(R.string.chat_action_delete_for_me),
                        tint = MeeshyPalette.Error,
                    )
                }
            }
            Box(Modifier.weight(1f), contentAlignment = Alignment.Center) {
                if (count >= 2) {
                    Text(
                        stringResource(R.string.chat_selection_count, count),
                        style = MaterialTheme.typography.labelLarge,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f),
                    )
                }
            }
            if (offer.copy) {
                IconButton(onClick = onCopy, enabled = count > 0) {
                    Icon(MeeshyIcons.Copy, contentDescription = stringResource(R.string.chat_action_copy), tint = accentColor)
                }
            }
            if (offer.star) {
                IconButton(onClick = onStar, enabled = count > 0) {
                    Icon(MeeshyIcons.Star, contentDescription = stringResource(R.string.chat_action_star), tint = accentColor)
                }
            }
            if (offer.forward) {
                IconButton(onClick = onForward, enabled = count > 0) {
                    Icon(MeeshyIcons.ForwardMessage, contentDescription = stringResource(R.string.chat_action_forward), tint = accentColor)
                }
            }
        }
    }
}
