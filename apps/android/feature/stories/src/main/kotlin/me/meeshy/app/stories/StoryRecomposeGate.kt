package me.meeshy.app.stories

import android.widget.Toast
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.heightIn
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import me.meeshy.ui.theme.MeeshySpacing
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import me.meeshy.feature.stories.R
import javax.inject.Inject

/** Porte le recompositeur jusqu'à l'écran : il survit à une recomposition comme à une rotation. */
@HiltViewModel
internal class StoryRecomposerViewModel @Inject constructor(val recomposer: StoryRecomposer) : ViewModel()

/**
 * Sème la scène de la story [recomposeStoryId] dans le composeur (#13849, iOS « Composer »). Inerte sans story à
 * recomposer ; semée une seule fois, même si l'écran tourne ; un voile couvre le composeur tant qu'elle se prépare, et
 * « Annuler » le referme. Un média qui ne revient pas ferme le composeur en le disant
 * (iOS `StoryRecomposition`) : il ne reste jamais ouvert sur une scène amputée que l'auteur publierait sans le savoir.
 */
@Composable
internal fun StoryRecomposeGate(
    recomposeStoryId: String?,
    viewModel: StoryComposerViewModel,
    onClose: () -> Unit,
    recompose: suspend (String) -> StoryRecomposed? = hiltViewModel<StoryRecomposerViewModel>().recomposer::recompose,
) {
    if (recomposeStoryId == null) return
    val context = LocalContext.current
    val unavailable = stringResource(R.string.story_recompose_unavailable)
    var seeded by rememberSaveable(recomposeStoryId) { mutableStateOf(false) }
    LaunchedEffect(recomposeStoryId) {
        if (seeded) return@LaunchedEffect
        val done = recompose(recomposeStoryId)
        seeded = true
        if (done == null) {
            Toast.makeText(context, unavailable, Toast.LENGTH_LONG).show()
            onClose()
        } else {
            viewModel.onRecomposed(done)
        }
    }
    if (!seeded) StoryRecomposePreparing(onCancel = onClose)
}

/**
 * Le voile de la préparation (iOS `MediaComposerDoor`, « Préparation du média… » et « Annuler ») : une fenêtre qui prend
 * le geste et le retour système — le composeur n'est rendu qu'une fois sa scène semée, jamais modifiable avant.
 */
@Composable
private fun StoryRecomposePreparing(onCancel: () -> Unit) {
    Dialog(onDismissRequest = onCancel, properties = DialogProperties(dismissOnClickOutside = false, usePlatformDefaultWidth = false)) {
        Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.surface) {
            Column(
                modifier = Modifier.fillMaxSize().semantics(mergeDescendants = false) { liveRegion = LiveRegionMode.Polite },
                verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md, Alignment.CenterVertically),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                CircularProgressIndicator()
                Text(stringResource(R.string.story_recompose_preparing), style = MaterialTheme.typography.bodyLarge)
                TextButton(onClick = onCancel, modifier = Modifier.heightIn(min = 48.dp)) { Text(stringResource(R.string.stories_cancel)) }
            }
        }
    }
}
