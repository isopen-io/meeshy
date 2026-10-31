package me.meeshy.app.stories

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.composer.ComposerSelectionSubject
import me.meeshy.sdk.model.composer.edit.ComposerBackgroundAction
import me.meeshy.sdk.model.composer.edit.ComposerBackgroundLevel
import me.meeshy.sdk.model.composer.edit.ComposerBackgroundSource
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing

internal const val BACKGROUND_SOURCES_TAG = "composer-background-sources"

private val SOURCE_ROW_HEIGHT = 52.dp

/** L'icône Material que l'arbre partagé nomme pour une entrée ; `null` : un nom que l'application ne dessine pas. */
internal fun composerEditIcon(material: String): ImageVector? = when (material) {
    "Edit" -> MeeshyIcons.Edit
    "SwapHorizontal" -> MeeshyIcons.SwapHorizontal
    "FlipToFront" -> MeeshyIcons.FlipToFront
    "Delete" -> MeeshyIcons.Delete
    "PhotoLibrary" -> MeeshyIcons.PhotoLibrary
    "Camera" -> MeeshyIcons.Camera
    "Folder" -> MeeshyIcons.Folder
    else -> null
}

internal fun ComposerBackgroundAction.glyph(): ImageVector = composerEditIcon(ComposerBackgroundLevel.entryOf(this).material) ?: MeeshyIcons.Edit

internal fun ComposerBackgroundSource.glyph(): ImageVector = composerEditIcon(ComposerBackgroundLevel.entryOf(this).material) ?: MeeshyIcons.Photo

internal val ComposerBackgroundAction.isDestructive: Boolean get() = ComposerBackgroundLevel.entryOf(this).destructive

internal fun ComposerBackgroundAction.labelRes(): Int = when (this) {
    ComposerBackgroundAction.EDIT -> R.string.story_canvas_action_edit
    ComposerBackgroundAction.REPLACE -> R.string.composer_edit_replace
    ComposerBackgroundAction.PUT_ON_SCENE -> R.string.composer_audio_promote_action
    ComposerBackgroundAction.REMOVE -> R.string.composer_selection_remove
}

internal fun ComposerBackgroundSource.labelRes(): Int = when (this) {
    ComposerBackgroundSource.LIBRARY -> R.string.composer_media_from_library
    ComposerBackgroundSource.CAMERA -> R.string.composer_media_from_camera
    ComposerBackgroundSource.FILES -> R.string.composer_media_from_files
}

/**
 * Le fond média sélectionné, vu de l'hôte (#13973) : les entrées de son niveau « Fond » ([actions]), les sources de
 * « Remplacer » ([sources]), ce que fait chacune, et la confirmation de Retirer, ouverte ou non.
 */
internal class BackgroundEditing(
    val actions: List<ComposerBackgroundAction>,
    val sources: List<ComposerBackgroundSource>,
    val onAction: (ComposerBackgroundAction) -> Unit,
    val onSource: (ComposerBackgroundSource) -> Unit,
    val confirming: Boolean,
    val onConfirmRemove: () -> Unit,
    val onCancelRemove: () -> Unit,
)

/**
 * Le niveau « Fond » du fond média sélectionné, ou `null` quand le fond n'est pas la sélection. Modifier ouvre ses
 * réglages en feuille basse, Remplacer la feuille de ses sources, Mettre sur la scène agit aussitôt, Retirer demande
 * d'abord. [cameraServed] : la scène sait filmer ; [onReplace] ouvre la photothèque ou les fichiers pour le fond [replacing].
 */
@Composable
internal fun rememberBackgroundEditing(
    state: StoryComposerUiState,
    viewModel: StoryComposerViewModel,
    openSheet: (StoryComposerSheet) -> Unit,
    cameraServed: Boolean,
    onReplace: (source: ComposerBackgroundSource, replacing: String) -> Unit,
): BackgroundEditing? {
    var confirming by remember { mutableStateOf(false) }
    val replacing = state.selectedSlideBackdropMediaId
    if (state.selectionSubject != ComposerSelectionSubject.BACKGROUND || replacing == null) return null
    val offers = ComposerBackgroundLevel.Offers(
        editor = true,
        mediaSource = state.mediaPickMode != StoryMediaPickMode.None,
        camera = cameraServed && state.mediaPickMode != StoryMediaPickMode.None,
    )
    return BackgroundEditing(
        actions = ComposerBackgroundLevel.actions(offers),
        sources = ComposerBackgroundLevel.sources(offers),
        onAction = { action ->
            when (action) {
                ComposerBackgroundAction.EDIT -> openSheet(StoryComposerSheet.OBJECT_EDIT)
                ComposerBackgroundAction.REPLACE -> openSheet(StoryComposerSheet.BACKGROUND_SOURCE)
                ComposerBackgroundAction.PUT_ON_SCENE -> viewModel.onPutBackgroundOnScene()
                ComposerBackgroundAction.REMOVE -> confirming = true
            }
        },
        onSource = { source -> onReplace(source, replacing) },
        confirming = confirming,
        onConfirmRemove = {
            confirming = false
            viewModel.onRemoveSelectedBackground()
        },
        onCancelRemove = { confirming = false },
    )
}

/** Le niveau « Fond » dans la colonne des outils, à la place des outils : un disque et son mot par entrée, Retirer en alerte. */
@Composable
internal fun SceneBackgroundColumn(background: BackgroundEditing) {
    Column(
        modifier = Modifier.testTag(EDITING_RAIL_TAG).verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        background.actions.forEach { action ->
            SceneOptionButton(
                icon = action.glyph(),
                label = stringResource(action.labelRes()),
                tint = if (action.isDestructive) MeeshyPalette.ErrorSoft else Color.White,
                onClick = { background.onAction(action) },
            )
        }
    }
}

/** Grand écran : le niveau « Fond » dans le rail gauche, sous son titre, à la place de ce qu'on ajoute. */
@Composable
internal fun StoryBackgroundRail(background: BackgroundEditing) {
    Column(
        modifier = Modifier.fillMaxWidth().testTag(EDITING_RAIL_TAG).verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        Text(
            text = stringResource(R.string.stories_composer_background),
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.SemiBold,
            color = Color.White.copy(alpha = 0.6f),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(MeeshySpacing.xs).semantics { heading() },
        )
        background.actions.forEach { action ->
            LabeledRailItem(
                icon = action.glyph(),
                label = stringResource(action.labelRes()),
                onClick = { background.onAction(action) },
                tint = if (action.isDestructive) MeeshyPalette.ErrorSoft else Color.White,
            )
        }
    }
}

/** Retirer le fond se confirme : la destruction se lit avant d'agir, ↶ la défait ensuite. */
@Composable
internal fun BackgroundRemoveConfirmation(background: BackgroundEditing) {
    if (!background.confirming) return
    AlertDialog(
        onDismissRequest = background.onCancelRemove,
        title = { Text(stringResource(R.string.composer_edit_remove_background_title)) },
        text = { Text(stringResource(R.string.composer_edit_remove_background_message)) },
        confirmButton = {
            TextButton(onClick = background.onConfirmRemove) {
                Text(stringResource(R.string.composer_selection_remove), color = MaterialTheme.colorScheme.error)
            }
        },
        dismissButton = { TextButton(onClick = background.onCancelRemove) { Text(stringResource(R.string.stories_cancel)) } },
    )
}

/** « Remplacer » : la feuille de ses sources, sans voile, la scène réduite au-dessus. */
@Composable
internal fun BackgroundSourceSheet(background: BackgroundEditing, onDone: () -> Unit) {
    ComposerAnchoredSheet(fill = false) {
        Column(Modifier.fillMaxWidth().testTag(BACKGROUND_SOURCES_TAG).padding(vertical = MeeshySpacing.sm)) {
            Text(
                text = stringResource(R.string.composer_edit_replace),
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.xs).semantics { heading() },
            )
            background.sources.forEach { source ->
                SourceRow(source) {
                    onDone()
                    background.onSource(source)
                }
            }
        }
    }
}

@Composable
private fun SourceRow(source: ComposerBackgroundSource, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = SOURCE_ROW_HEIGHT)
            .clickable(role = Role.Button, onClick = onClick)
            .padding(horizontal = MeeshySpacing.md),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.smPlus),
    ) {
        Icon(source.glyph(), contentDescription = null, modifier = Modifier.size(22.dp))
        Text(stringResource(source.labelRes()), style = MaterialTheme.typography.bodyLarge)
    }
}
