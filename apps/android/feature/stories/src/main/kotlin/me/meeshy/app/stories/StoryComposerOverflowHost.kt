package me.meeshy.app.stories

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import me.meeshy.feature.stories.R
import me.meeshy.ui.component.composer.ComposerConfirmationDialog
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshySpacing

/** Ce que le « ⋯ » ouvre par-dessus le compositeur (#13845) : l'aperçu, et la question avant de tout effacer. */
internal class StoryOverflowDialogs(val preview: () -> Unit, val clearAll: () -> Unit)

/**
 * L'hôte des deux entrées du « ⋯ » qui posent une fenêtre : « Aperçu » rejoue la composition par le lecteur partagé, « Tout
 * effacer » demande d'abord — l'action qui perd en rouge, « Annuler » qui ne perd rien ; ↶ Défaire rétablit ensuite tout.
 */
@Composable
internal fun rememberStoryOverflowDialogs(state: StoryComposerUiState, viewModel: StoryComposerViewModel): StoryOverflowDialogs {
    var previewing by remember { mutableStateOf(false) }
    var confirming by remember { mutableStateOf(false) }
    if (confirming) {
        ComposerConfirmationDialog(
            title = stringResource(R.string.composer_clear_all_title),
            message = stringResource(R.string.composer_clear_all_message),
            destructiveLabel = stringResource(R.string.composer_more_clear_all),
            onDestructive = { confirming = false; viewModel.onClearAll() },
            safeLabel = stringResource(R.string.composer_clear_all_cancel),
            onSafe = { confirming = false },
            onDismissRequest = { confirming = false },
        )
    }
    if (previewing) StoryComposerPreviewDialog(state, viewModel, onDismiss = { previewing = false })
    return remember { StoryOverflowDialogs(preview = { previewing = true }, clearAll = { confirming = true }) }
}

/**
 * L'aperçu plein écran : chaque diapo publiable, jouée par [StoryScenePlayer] depuis la charge que la publication enverrait
 * ([StoryComposerPreview]). Toucher à gauche ou à droite change de diapo, ✕ ou le retour système referment.
 */
@Composable
private fun StoryComposerPreviewDialog(state: StoryComposerUiState, viewModel: StoryComposerViewModel, onDismiss: () -> Unit) {
    val slides = remember(state.deck, state.attachments, state.draft) {
        val projector = StorySlideProjector(viewModel.mediaBaseUrl)
        StoryComposerPreview.items(state, viewModel.resolvePublishLanguage(), viewModel.authorFloor)
            .map { projector.project(it, viewModel.authorAccentHex.orEmpty(), NoContentPreferences) }
    }
    if (slides.isEmpty()) return
    var page by remember { mutableIntStateOf(0) }
    val index = page.coerceIn(0, slides.lastIndex)
    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Box(Modifier.fillMaxSize().background(Color.Black).safeDrawingPadding(), contentAlignment = Alignment.Center) {
            Box(Modifier.aspectRatio(PREVIEW_ASPECT)) {
                StoryScenePlayer(slide = slides[index], playing = true, muted = false, loads = true, rewindWhenIdle = true)
                Row(Modifier.fillMaxSize()) {
                    PreviewTurn(enabled = index > 0, label = stringResource(R.string.composer_preview_previous)) { page = index - 1 }
                    PreviewTurn(enabled = index < slides.lastIndex, label = stringResource(R.string.composer_preview_next)) { page = index + 1 }
                }
            }
            SceneRoundButton(
                icon = MeeshyIcons.Close,
                label = stringResource(R.string.composer_preview_close),
                onClick = onDismiss,
                modifier = Modifier.align(Alignment.TopStart).padding(MeeshySpacing.sm),
            )
        }
    }
}

/** Une moitié de l'aperçu qui tourne la page ; sans page de ce côté, elle n'est ni touchable ni annoncée. */
@Composable
private fun androidx.compose.foundation.layout.RowScope.PreviewTurn(enabled: Boolean, label: String, onTurn: () -> Unit) {
    if (!enabled) {
        Spacer(Modifier.weight(1f).fillMaxHeight())
        return
    }
    Box(
        Modifier
            .weight(1f)
            .fillMaxHeight()
            .clickable(role = Role.Button, onClick = onTurn)
            .semantics { contentDescription = label },
    )
}

private const val PREVIEW_ASPECT = 9f / 16f
