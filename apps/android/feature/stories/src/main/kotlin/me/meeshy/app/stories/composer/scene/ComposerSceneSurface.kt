package me.meeshy.app.stories.composer.scene

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import me.meeshy.app.stories.StoryComposerUiState
import me.meeshy.app.stories.isBlankScene
import me.meeshy.app.stories.selectedSceneObject
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.composer.ComposerSceneInvite as SceneInviteLaw

/**
 * L'invite d'une scène vide : « Ceci est votre scène — ajoutez-y un texte, un dessin, une image ou une vidéo ». Elle se
 * pose sur le plateau sombre et ne prend AUCUN toucher : un toucher sur la scène vide arme toujours le viseur. [shown]
 * vient de [ComposerSceneInvite.shown].
 */
@Composable
internal fun ComposerSceneInvite(shown: Boolean, modifier: Modifier = Modifier) {
    if (!shown) return
    Box(modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Text(
            text = stringResource(R.string.composer_scene_invite),
            style = MaterialTheme.typography.bodyLarge,
            color = Color.White.copy(alpha = 0.72f),
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(horizontal = 72.dp),
        )
    }
}

/** L'invite paraît sur une scène nue, au repos : rien d'ouvert, rien de sélectionné, aucun pinceau, viseur désarmé. */
internal fun sceneInviteShown(state: StoryComposerUiState, viewfinderArmed: Boolean, somethingOpen: Boolean): Boolean =
    SceneInviteLaw.shown(
        sceneIsEmpty = state.deck.selectedSlide.isBlankScene && !state.isUploadingMedia,
        toolIsOpen = somethingOpen || state.isDrawingActive || state.isEditingTextElement || state.band.activeTool != null,
        selecting = state.selectedSceneObject != null,
        viewfinderArmed = viewfinderArmed,
    )
