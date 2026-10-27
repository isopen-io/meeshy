package me.meeshy.app.stories

import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.graphics.vector.ImageVector
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.composer.SceneObjectMenu.Action
import me.meeshy.ui.icons.MeeshyIcons

/**
 * Le menu d'appui long d'un objet de la scène (vue `1d`) : seulement les actions que la loi
 * [me.meeshy.sdk.model.composer.SceneObjectMenu] sert à cet objet — jamais une ligne grisée —,
 * la destructrice en dernier et en couleur d'alerte. Ancré à l'objet qu'il vise.
 */
@Composable
internal fun SceneObjectMenuPopup(
    menu: SceneObjectContextMenu?,
    onAction: (Action) -> Unit,
    onDismiss: () -> Unit,
) {
    DropdownMenu(expanded = menu != null, onDismissRequest = onDismiss) {
        menu?.actions?.forEach { action ->
            val tint = if (action.isDestructive) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface
            DropdownMenuItem(
                text = { Text(stringResource(action.labelRes()), color = tint) },
                leadingIcon = { Icon(action.icon(), contentDescription = null, tint = tint) },
                onClick = { onAction(action) },
            )
        }
    }
}

internal fun Action.labelRes(): Int = when (this) {
    Action.EDIT -> R.string.story_canvas_action_edit
    Action.DUPLICATE -> R.string.story_canvas_action_duplicate
    Action.BRING_FORWARD -> R.string.story_canvas_action_bringForward
    Action.SEND_BACKWARD -> R.string.story_canvas_action_sendBackward
    Action.LEAVE_SCENE -> R.string.story_canvas_action_leaveScene
    Action.DELETE -> R.string.story_canvas_action_delete
    Action.TRIM, Action.SET_AS_BACKGROUND, Action.REPLACE_BACKGROUND -> R.string.story_canvas_action_edit
}

internal fun Action.icon(): ImageVector = when (this) {
    Action.EDIT, Action.TRIM -> MeeshyIcons.Edit
    Action.DUPLICATE -> MeeshyIcons.Copy
    Action.BRING_FORWARD -> MeeshyIcons.LayersFilled
    Action.SEND_BACKWARD -> MeeshyIcons.Layers
    Action.LEAVE_SCENE -> MeeshyIcons.SignOut
    Action.SET_AS_BACKGROUND, Action.REPLACE_BACKGROUND -> MeeshyIcons.Layers
    Action.DELETE -> MeeshyIcons.Delete
}
