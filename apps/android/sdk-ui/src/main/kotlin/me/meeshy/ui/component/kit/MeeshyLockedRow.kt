package me.meeshy.ui.component.kit

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.ui.R
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.accessibility.decorative
import me.meeshy.ui.accessibility.meeshyTapTarget
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme

/**
 * **La rangée qui montre ce qui est fermé** (K37) : un pointillé, un cadenas, ce que c'est et ce qu'il faut pour l'ouvrir.
 * Trois formes — la rangée, la tuile d'une grille, la mention en ligne. Elle ne reçoit QUE trois textes ([title],
 * [requirement], le titre de [action]) : aucune valeur, image ou compte protégé n'a de place dans sa signature, donc aucun
 * n'a jamais pu être rendu sous un voile.
 *
 * L'état fermé est écrit et dit (« Présence, verrouillé, dès Ami »), jamais seulement atténué. [isUnlocking] joue l'ouverture
 * UNE fois (fondu de 280 ms, 160 sous mouvement réduit) ; quand l'hôte ne dit plus ni [isOpen] ni [isUnlocking], elle se
 * referme. L'envoi de la demande reste à l'hôte : [MeeshyLockedRowAction.isPending] et `isDone` lui sont remis, jamais
 * gardés. Jumeau iOS : `MeeshyLockedRow`.
 */
@Composable
@Suppress("LongParameterList", "LongMethod")
public fun MeeshyLockedRow(
    title: String,
    requirement: String,
    modifier: Modifier = Modifier,
    form: MeeshyLockedRowForm = MeeshyLockedRowForm.Row,
    icon: ImageVector? = null,
    isOpen: Boolean = false,
    isUnlocking: Boolean = false,
    action: MeeshyLockedRowAction? = null,
    tint: Color? = null,
    enabled: Boolean = true,
    onPress: (() -> Unit)? = null,
) {
    val reduce = LocalReduceMotion.current
    var hasPlayed by remember { mutableStateOf(false) }
    LaunchedEffect(isUnlocking) {
        if (MeeshyLockedRowRecipe.unlockStep(isUnlocking, hasPlayed) == MeeshyLockedRowUnlockStep.Play) hasPlayed = true
    }
    val shownOpen = MeeshyLockedRowRecipe.shownOpen(isOpen, isUnlocking, hasPlayed)
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val values = MeeshyLockedRowRecipe.resolve(
        form, action != null, action?.isPending == true, action?.isDone == true, shownOpen,
        isPressable = onPress != null, isPressed = pressed, isEnabled = enabled, isUnlocking = isUnlocking, reduceMotion = reduce,
    )
    val dash by animateFloatAsState(if (shownOpen) 0f else 1f, tween(values.unlockFadeMillis), label = "locked-row-dash")
    val ink = tint ?: MeeshyPalette.Indigo500
    val tokens = MeeshyTheme.tokens
    val words = MeeshyLockedRowWords(stringResource(R.string.kit_locked_row_locked), stringResource(R.string.kit_locked_row_unlocked))
    val shape = RoundedCornerShape(values.cornerRadiusDp.dp)
    val frame = modifier
        .let { if (form == MeeshyLockedRowForm.Inline) it else it.fillMaxWidth() }
        .graphicsLayer { scaleX = values.pressedScale; scaleY = values.pressedScale }
        .clip(shape)
        .drawBehind {
            if (form == MeeshyLockedRowForm.Inline) return@drawBehind
            val stroke = values.strokeWidthDp.dp.toPx()
            drawRoundRect(
                color = tokens.textMuted.copy(alpha = dash),
                topLeft = androidx.compose.ui.geometry.Offset(stroke / 2, stroke / 2),
                size = Size(size.width - stroke, size.height - stroke),
                cornerRadius = CornerRadius(values.cornerRadiusDp.dp.toPx()),
                style = Stroke(stroke, pathEffect = PathEffect.dashPathEffect(values.dashDp.map { it.dp.toPx() }.toFloatArray())),
            )
        }
        .let { if (values.isButton) it.clickable(interactionSource = interaction, indication = null, role = Role.Button) { onPress?.invoke() } else it }
        .heightIn(min = values.minimumHeightDp.dp)
    val lock: @Composable () -> Unit = {
        Icon(
            if (shownOpen) MeeshyIcons.LockOpen else MeeshyIcons.Lock, contentDescription = null,
            tint = tokens.textSecondary, modifier = Modifier.size(values.lockSizeDp.dp).decorative(),
        )
    }
    val spoken = words.spokenLabel(title, requirement, shownOpen)
    val texts: @Composable () -> Unit = {
        Column(Modifier.semantics(mergeDescendants = true) { contentDescription = spoken }) {
            Text(title, color = tokens.textPrimary, fontSize = 15.sp, fontWeight = FontWeight.Bold)
            Text(requirement, color = tokens.textSecondary, fontSize = 12.5.sp)
        }
    }
    val actionButton: @Composable () -> Unit = {
        if (values.showsAction && action != null) {
            MeeshyButton(
                title = action.title, onClick = action.perform, kind = MeeshyButtonKind.Tinted, size = MeeshyButtonSize.S44, tint = ink,
                isPending = action.isPending, enabled = values.actionIsActive || action.isPending,
                modifier = Modifier.meeshyTapTarget(values.actionHeightDp.dp),
            )
        }
    }
    when (form) {
        MeeshyLockedRowForm.Row -> Row(frame.padding(horizontal = 16.dp, vertical = 12.dp), Arrangement.spacedBy(12.dp), Alignment.CenterVertically) {
            if (!shownOpen) lock()
            Column(Modifier.weight(1f)) { texts() }
            actionButton()
        }
        MeeshyLockedRowForm.Tile -> Column(frame.padding(16.dp), Arrangement.spacedBy(8.dp), Alignment.CenterHorizontally) {
            icon?.let { Icon(it, contentDescription = null, tint = tokens.textMuted, modifier = Modifier.size(values.thingGlyphSizeDp.dp).decorative()) }
            texts()
            if (!shownOpen) lock()
            actionButton()
        }
        MeeshyLockedRowForm.Inline -> Row(frame, Arrangement.spacedBy(6.dp), Alignment.CenterVertically) {
            if (!shownOpen) lock()
            Text(
                "$title · $requirement", color = tokens.textSecondary, fontSize = 12.5.sp,
                modifier = Modifier.semantics { contentDescription = spoken },
            )
        }
    }
}
