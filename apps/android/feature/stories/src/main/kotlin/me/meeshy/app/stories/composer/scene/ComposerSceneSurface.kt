package me.meeshy.app.stories.composer.scene

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
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
import me.meeshy.app.stories.SCENE_HINT_RAIL_CLEARANCE
import me.meeshy.app.stories.StorySceneCaptureHint
import me.meeshy.app.stories.StoryComposerUiState
import me.meeshy.app.stories.isBlankScene
import me.meeshy.app.stories.selectedSceneObject
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.composer.ComposerSceneInvite as SceneInviteLaw
import me.meeshy.sdk.model.composer.capture.SceneQuickCapture
import me.meeshy.ui.theme.MeeshySpacing

/**
 * L'invite d'une scène vide : « Ceci est votre scène — ajoutez-y un texte, un dessin, une image ou une vidéo ». Elle se
 * pose sur le plateau sombre et ne prend AUCUN toucher : un toucher sur la scène vide arme toujours le viseur. [shown]
 * vient de [ComposerSceneInvite.shown]. La ligne d'aide du viseur ([hint]) paraît dans les mêmes conditions : elle se lit
 * SOUS l'invite, dans le même bloc centré, jamais par-dessus (#16204).
 */
@Composable
internal fun ComposerSceneInvite(shown: Boolean, modifier: Modifier = Modifier, hint: SceneQuickCapture.Offer? = null) {
    if (!shown) return
    Box(modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
            modifier = Modifier.padding(horizontal = SCENE_HINT_RAIL_CLEARANCE),
        ) {
            Text(
                text = stringResource(R.string.composer_scene_invite),
                style = MaterialTheme.typography.bodyLarge,
                color = Color.White.copy(alpha = 0.72f),
                textAlign = TextAlign.Center,
            )
            hint?.let { StorySceneCaptureHint(it) }
        }
    }
}

/** L'invite paraît sur une scène nue, au repos : rien d'ouvert, rien de sélectionné, aucun pinceau, viseur désarmé. */
internal fun sceneInviteShown(state: StoryComposerUiState, viewfinderArmed: Boolean, somethingOpen: Boolean): Boolean =
    SceneInviteLaw.shown(
        sceneIsEmpty = state.deck.selectedSlide.isBlankScene && !state.isPreparingMedia,
        toolIsOpen = somethingOpen || state.isDrawingActive || state.isEditingTextElement || state.band.activeTool != null,
        selecting = state.selectedSceneObject != null,
        viewfinderArmed = viewfinderArmed,
    )
