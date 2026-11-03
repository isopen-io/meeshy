package me.meeshy.app.stories

import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.semantics
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.PresenceState
import me.meeshy.sdk.model.story.StoryGroupIntro
import me.meeshy.sdk.model.story.StoryGroupIntroAction
import me.meeshy.sdk.model.story.StoryGroupIntroGesture

/**
 * L'interstitiel plein écran de l'interlude (iOS `StoryGroupIntroOverlay`) : une base OPAQUE (la story du nouveau
 * groupe n'est jamais visible dessous), la carte d'identité, et les gestes — double toucher n'importe où = passer à la
 * première slide, toucher à gauche = revenir au groupe précédent, à droite = passer. Un glissé n'est jamais requalifié
 * en toucher : le détecteur de la plateforme abandonne le toucher dès que le doigt dépasse sa tolérance, et ne le
 * reprend pas s'il revient à son point de départ.
 */
@Composable
internal fun StoryGroupIntroOverlay(
    intro: StoryGroupIntro,
    avatarUrl: String?,
    presence: PresenceState?,
    onSkip: () -> Unit,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val skip by rememberUpdatedState(onSkip)
    val back by rememberUpdatedState(onBack)
    val presenceLabel = presence?.let { stringResource(storyGroupIntroPresenceLabel(it)) }
    val summary = intro.summary(presenceLabel)
    val skipHint = stringResource(R.string.story_group_intro_skip_hint)
    Box(
        modifier
            .fillMaxSize()
            .background(Color.Black)
            .pointerInput(Unit) {
                detectTapGestures(
                    onDoubleTap = { if (StoryGroupIntroGesture.onDoubleTap() == StoryGroupIntroAction.Skip) skip() },
                    onTap = { offset ->
                        when (StoryGroupIntroGesture.onTap(offset.x, size.width.toFloat())) {
                            StoryGroupIntroAction.Back -> back()
                            StoryGroupIntroAction.Skip -> skip()
                        }
                    },
                )
            }
            .semantics(mergeDescendants = true) {
                contentDescription = summary
                onClick(label = skipHint) { skip(); true }
            },
    ) {
        StoryAuthorIdentityCard(intro = intro, avatarUrl = avatarUrl, presence = presence)
    }
}
