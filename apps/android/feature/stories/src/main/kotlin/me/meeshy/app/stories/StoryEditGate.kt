package me.meeshy.app.stories

import android.widget.Toast
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import me.meeshy.feature.stories.R
import javax.inject.Inject

/** Porte l'éditeur de story jusqu'à l'écran : il survit à une recomposition comme à une rotation. */
@HiltViewModel
internal class StoryEditorViewModel @Inject constructor(val editor: StoryEditor) : ViewModel()

/**
 * Rouvre la story [editStoryId] dans le composeur (#13632). Inerte quand le composeur ne s'ouvre pas pour une édition.
 * Une story qui ne se rouvre pas (supprimée, expirée, d'un autre auteur, injoignable) ferme le composeur en le disant :
 * il ne reste jamais ouvert VIDE, où l'auteur publierait une story neuve en croyant modifier l'ancienne.
 */
@Composable
internal fun StoryEditGate(editStoryId: String?, viewModel: StoryComposerViewModel, onClose: () -> Unit) {
    if (editStoryId == null) return
    val editor = hiltViewModel<StoryEditorViewModel>().editor
    val context = LocalContext.current
    val unavailable = stringResource(R.string.story_edit_unavailable)
    LaunchedEffect(editStoryId) {
        if (!viewModel.onEditRequested()) return@LaunchedEffect
        val opening = editor.open(editStoryId)
        if (opening == null) {
            Toast.makeText(context, unavailable, Toast.LENGTH_SHORT).show()
            onClose()
        } else {
            viewModel.onEditing(opening, editor)
        }
    }
}

/** Pourquoi l'ajout d'une slide est refusé : une story publiée n'en tient qu'une, sinon le plafond de la scène. */
@androidx.annotation.StringRes
internal fun StoryComposerUiState.addSlideRefusalRes(): Int =
    if (editing) R.string.story_edit_no_add_slide else R.string.composer_slide_rail_capReached
