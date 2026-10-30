package me.meeshy.app.stories

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
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
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.composer.ComposerSelectionAction
import me.meeshy.sdk.model.composer.SceneObjectMenu
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius

internal const val SELECTION_BAR_TAG = "composer-selection-bar"

private val BAR_HEIGHT = 56.dp
private val BAR_VEIL = Color(0xFF0F0F1E).copy(alpha = 0.72f)

/**
 * La barre d'actions de l'élément sélectionné (#13836, état 3 de la maquette), posée sur la scène juste au-dessus de
 * Public et Publier : une icône et un MOT par action, chacune une cible de toute la hauteur de la barre. L'Ordre ouvre
 * premier plan et arrière-plan ; Retirer est en couleur d'alerte, et l'historique la défait. Le rail droit du grand
 * écran (#13837) sert la même liste, depuis la même loi.
 */
@Composable
internal fun ComposerSelectionActionBar(
    bar: SceneSelectionBar,
    onAction: (ComposerSelectionAction) -> Unit,
    onOrder: (SceneObjectMenu.Action) -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .testTag(SELECTION_BAR_TAG)
            .fillMaxWidth()
            .height(BAR_HEIGHT)
            .clip(RoundedCornerShape(MeeshyRadius.pill))
            .background(BAR_VEIL)
            .padding(horizontal = 6.dp),
        horizontalArrangement = Arrangement.SpaceEvenly,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        bar.actions.forEach { action ->
            if (action == ComposerSelectionAction.ORDER) {
                OrderAction(bar.orderChoices, onOrder)
            } else {
                SelectionActionItem(action, onClick = { onAction(action) }, modifier = Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun RowScope.OrderAction(choices: List<SceneObjectMenu.Action>, onOrder: (SceneObjectMenu.Action) -> Unit) {
    var open by remember { mutableStateOf(false) }
    Box(Modifier.weight(1f)) {
        SelectionActionItem(ComposerSelectionAction.ORDER, onClick = { open = true }, modifier = Modifier.fillMaxWidth())
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            choices.forEach { choice ->
                DropdownMenuItem(
                    text = { Text(stringResource(choice.labelRes())) },
                    leadingIcon = { Icon(choice.icon(), contentDescription = null) },
                    onClick = {
                        open = false
                        onOrder(choice)
                    },
                )
            }
        }
    }
}

@Composable
private fun SelectionActionItem(action: ComposerSelectionAction, onClick: () -> Unit, modifier: Modifier) {
    val tint = if (action.isDestructive) MeeshyPalette.ErrorSoft else Color.White
    Column(
        modifier = modifier
            .height(BAR_HEIGHT)
            .clip(RoundedCornerShape(MeeshyRadius.md))
            .clickable(role = Role.Button, onClick = onClick),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(action.glyph(), contentDescription = null, tint = tint, modifier = Modifier.size(20.dp))
        Text(
            text = stringResource(action.labelRes()),
            color = tint,
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.SemiBold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

internal fun ComposerSelectionAction.glyph(): ImageVector = when (this) {
    ComposerSelectionAction.EDIT -> MeeshyIcons.Edit
    ComposerSelectionAction.ORDER -> MeeshyIcons.SwapVertical
    ComposerSelectionAction.DUPLICATE -> MeeshyIcons.Copy
    ComposerSelectionAction.TIME -> MeeshyIcons.ScheduleFilled
    ComposerSelectionAction.REMOVE -> MeeshyIcons.Delete
}

internal fun ComposerSelectionAction.labelRes(): Int = when (this) {
    ComposerSelectionAction.EDIT -> R.string.story_canvas_action_edit
    ComposerSelectionAction.ORDER -> R.string.composer_selection_order
    ComposerSelectionAction.DUPLICATE -> R.string.story_canvas_action_duplicate
    ComposerSelectionAction.TIME -> R.string.composer_scene_more_timing
    ComposerSelectionAction.REMOVE -> R.string.composer_selection_remove
}
