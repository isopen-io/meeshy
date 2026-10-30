package me.meeshy.app.stories

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Box
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.semantics
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.composer.ComposerMediaSource
import me.meeshy.ui.icons.MeeshyIcons

/**
 * L'appui long d'un outil (#13845) : [label] annonce le geste à TalkBack, [open] présente le choix, et [actions] offrent
 * chaque source directement, comme les actions nommées de VoiceOver sur iOS (`ComposerRailEntryLongPress`).
 */
internal class ToolLongPress(val label: String, val open: () -> Unit, val actions: List<CustomAccessibilityAction>)

/** Le toucher d'un outil et, s'il en a un, son appui long — qui n'est jamais suivi d'un toucher. */
@OptIn(ExperimentalFoundationApi::class)
internal fun Modifier.toolPress(onClick: () -> Unit, enabled: Boolean = true, press: ToolLongPress? = null): Modifier =
    combinedClickable(
        enabled = enabled,
        role = Role.Button,
        onLongClickLabel = press?.label,
        onLongClick = press?.open,
        onClick = onClick,
    ).then(if (press != null) Modifier.semantics { customActions = press.actions } else Modifier)

/**
 * L'appui long sur Média (#13845, iOS `ComposerRailDoorLongPress`) : la photothèque ou les fichiers. Le toucher bref garde son
 * geste. [content] reçoit l'appui long à poser sur le bouton ; sans source ([sources] vide), il n'en reçoit aucun.
 */
@Composable
internal fun MediaSourcesAnchor(
    sources: List<ComposerMediaSource>,
    onSource: (ComposerMediaSource) -> Unit,
    content: @Composable (ToolLongPress?) -> Unit,
) {
    if (sources.isEmpty()) {
        content(null)
        return
    }
    var open by remember { mutableStateOf(false) }
    val pick by rememberUpdatedState(onSource)
    val label = stringResource(R.string.composer_media_sources)
    val names = sources.map { stringResource(it.labelRes()) }
    val press = remember(sources, names, label) {
        ToolLongPress(
            label = label,
            open = { open = true },
            actions = sources.zip(names).map { (source, name) -> CustomAccessibilityAction(name) { pick(source); true } },
        )
    }
    Box {
        content(press)
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            sources.zip(names).forEach { (source, name) ->
                DropdownMenuItem(
                    text = { Text(name) },
                    leadingIcon = { Icon(source.glyph(), contentDescription = null) },
                    onClick = {
                        open = false
                        pick(source)
                    },
                )
            }
        }
    }
}

private fun ComposerMediaSource.labelRes(): Int = when (this) {
    ComposerMediaSource.PHOTO_LIBRARY -> R.string.composer_media_from_library
    ComposerMediaSource.FILES -> R.string.composer_media_from_files
}

private fun ComposerMediaSource.glyph() = when (this) {
    ComposerMediaSource.PHOTO_LIBRARY -> MeeshyIcons.PhotoLibrary
    ComposerMediaSource.FILES -> MeeshyIcons.Folder
}
