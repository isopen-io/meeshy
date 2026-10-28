package me.meeshy.app.stories

import androidx.compose.foundation.layout.padding
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.composer.scene.ComposerBackgroundMenuAction
import me.meeshy.ui.icons.MeeshyIcons

/**
 * **Ce qu'un appui long sur un FOND image ou vidéo propose** (miroir de `ComposerBackgroundMenuCopy` iOS, #5041) : les
 * entrées viennent de la loi pure [ComposerBackgroundMenuAction.served] — ici, sans éditeur ni viseur montés, ramener en
 * avant puis supprimer. La destruction vient en dernier et se peint en erreur avant qu'on la touche.
 */
@Composable
internal fun ComposerBackgroundMenu(
    expanded: Boolean,
    onAction: (ComposerBackgroundMenuAction) -> Unit,
    onDismiss: () -> Unit,
) {
    DropdownMenu(expanded = expanded, onDismissRequest = onDismiss) {
        Text(
            text = stringResource(R.string.stories_scene_background_menu_title),
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp).semantics { heading() },
        )
        ComposerBackgroundMenuAction.served(offersPhoto = false, offersEdit = false).forEach { action ->
            val tint = if (action.isDestructive) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface
            DropdownMenuItem(
                text = { Text(stringResource(action.labelRes()), color = tint) },
                leadingIcon = { Icon(action.icon(), contentDescription = null, tint = tint) },
                onClick = { onAction(action) },
            )
        }
    }
}

private fun ComposerBackgroundMenuAction.labelRes(): Int = when (this) {
    ComposerBackgroundMenuAction.EDIT -> R.string.stories_scene_background_menu_edit
    ComposerBackgroundMenuAction.RETAKE_PHOTO -> R.string.stories_scene_background_menu_retake_photo
    ComposerBackgroundMenuAction.BRING_FORWARD -> R.string.stories_scene_background_menu_bring_forward
    ComposerBackgroundMenuAction.DELETE -> R.string.stories_scene_background_menu_delete
}

private fun ComposerBackgroundMenuAction.icon() = when (this) {
    ComposerBackgroundMenuAction.EDIT -> MeeshyIcons.Edit
    ComposerBackgroundMenuAction.RETAKE_PHOTO -> MeeshyIcons.Camera
    ComposerBackgroundMenuAction.BRING_FORWARD -> MeeshyIcons.Layers
    ComposerBackgroundMenuAction.DELETE -> MeeshyIcons.Delete
}
