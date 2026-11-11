package me.meeshy.app.calls

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.call.CallAudioStageLayout
import me.meeshy.ui.theme.MeeshySpacing

internal const val CALL_AUDIO_STAGE_TAG = "call-audio-stage"
internal const val CALL_COMPACT_AUDIO_HEADER_TAG = "call-compact-audio-header"

/**
 * #17529 — the audio stage of a duo, at its full size or, when the journal opens in the pill, shrunk into the compact
 * header (law 6, view P9b; iOS `compactsAudioLayout`). The full stage stays centred in its room; the header sits at
 * the top. The passage moves the transform and the opacity only ([CallAudioStageLayout]); under « Reduce animations »
 * both only fade.
 */
@Composable
internal fun CallAudioStageSwitch(
    compact: Boolean,
    state: CallUiState,
    peer: CallPeerVisual,
    modifier: Modifier = Modifier,
    signalingDegraded: Boolean = false,
    peerSpeech: CallPeerSpeechSource = CallPeerSpeechSource.NONE,
    reduceMotion: Boolean = rememberCallReduceMotion(),
) {
    val transitions = remember(reduceMotion) { CallAudioStageTransitions.of(reduceMotion) }
    Box(modifier) {
        AnimatedVisibility(
            visible = !compact,
            modifier = Modifier.align(Alignment.Center),
            enter = transitions.stageEnter,
            exit = transitions.stageExit,
            label = "callAudioStage",
        ) {
            CallAudioStage(
                state = state,
                peer = peer,
                modifier = Modifier.testTag(CALL_AUDIO_STAGE_TAG),
                signalingDegraded = signalingDegraded,
                peerSpeech = peerSpeech,
            )
        }
        AnimatedVisibility(
            visible = compact,
            modifier = Modifier.align(Alignment.TopStart).fillMaxWidth(),
            enter = transitions.headerEnter,
            exit = transitions.headerExit,
            label = "callCompactAudioHeader",
        ) {
            CallCompactAudioHeader(
                state = state,
                peer = peer,
                signalingDegraded = signalingDegraded,
                peerSpeech = peerSpeech,
                modifier = Modifier.testTag(CALL_COMPACT_AUDIO_HEADER_TAG),
            )
        }
    }
}

/**
 * The avatar shrunk to [CallAudioStageLayout.COMPACT_AVATAR_DP], the name and the duration beside it (iOS
 * `CallCompactAudioHeader`). The status pills (reconnection, muted contact, server) stay under the row while their
 * cause lasts: the journal never hides them.
 */
@Composable
internal fun CallCompactAudioHeader(
    state: CallUiState,
    peer: CallPeerVisual,
    modifier: Modifier = Modifier,
    signalingDegraded: Boolean = false,
    peerSpeech: CallPeerSpeechSource = CallPeerSpeechSource.NONE,
) {
    Column(
        modifier = modifier.padding(horizontal = MeeshySpacing.lg),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        Row(
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            CallAvatarPair(
                name = state.peerName,
                peer = peer,
                size = CallAudioStageLayout.COMPACT_AVATAR_DP.dp,
                peerSpeech = peerSpeech,
            )
            Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs)) {
                Text(
                    text = callPeerTitle(state.peerName),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = CallPalette.Ink,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                state.durationLabel?.let { clock ->
                    CallStageDuration(clock, state.durationSeconds, live = state.hasLiveClock, compact = true)
                }
            }
        }
        CallStagePills(state, signalingDegraded, horizontalAlignment = Alignment.Start)
    }
}

/** The four transitions of [CallAudioStageSwitch], built once per « Reduce animations » setting. */
private class CallAudioStageTransitions(
    val stageEnter: EnterTransition,
    val stageExit: ExitTransition,
    val headerEnter: EnterTransition,
    val headerExit: ExitTransition,
) {
    companion object {
        /** The stage leaves toward the header: it rises and shrinks from its top edge while the header fades in. */
        private val TOWARD_HEADER = TransformOrigin(pivotFractionX = 0.5f, pivotFractionY = 0f)

        fun of(reduceMotion: Boolean): CallAudioStageTransitions {
            val millis = CallAudioStageLayout.transitionMillis(reduceMotion)
            val appear = fadeIn(animationSpec = tween(millis))
            val vanish = fadeOut(animationSpec = tween(millis))
            if (!CallAudioStageLayout.morphs(reduceMotion)) return CallAudioStageTransitions(appear, vanish, appear, vanish)
            val shrink = CallAudioStageLayout.SHRINK_SCALE
            return CallAudioStageTransitions(
                stageEnter = appear +
                    scaleIn(animationSpec = tween(millis), initialScale = shrink, transformOrigin = TOWARD_HEADER) +
                    slideInVertically(animationSpec = tween(millis)) { height -> -height / 2 },
                stageExit = vanish +
                    scaleOut(animationSpec = tween(millis), targetScale = shrink, transformOrigin = TOWARD_HEADER) +
                    slideOutVertically(animationSpec = tween(millis)) { height -> -height / 2 },
                headerEnter = appear,
                headerExit = vanish,
            )
        }
    }
}
