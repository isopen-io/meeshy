package me.meeshy.app.calls

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.LifecycleStartEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.calls.R
import me.meeshy.sdk.call.CallSpeakerColor
import me.meeshy.sdk.model.call.CallTileSize
import me.meeshy.sdk.model.call.IncomingCallChoices
import me.meeshy.sdk.model.call.IncomingPreAnswer
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import org.webrtc.EglBase
import org.webrtc.VideoTrack

/**
 * Ce que l'écran entrant tient de l'appel pour sa barre d'avant le décroché et ma vignette (P17.4 à P17.9) : la piste de
 * MA caméra (démarrée pour l'aperçu seulement), mon identifiant (la graine de MA couleur) et les deux gestes qui
 * remontent — la caméra choisie, le micro coupé à poser après la réponse. Rien n'en part au pair avant le décroché.
 */
internal class IncomingPreAnswerHost(
    val selfTrack: VideoTrack?,
    val eglContext: EglBase.Context,
    val selfUserId: String,
    val onCameraChosen: (Boolean) -> Unit,
    val onAnswerMuted: (Boolean) -> Unit,
)

/** L'hôte de l'écran entrant d'un appel VIDÉO ; `null` pour un appel audio, qui n'ouvre ni caméra ni contexte graphique. */
@Composable
internal fun rememberIncomingPreAnswerHost(viewModel: CallViewModel, isVideoCall: Boolean): IncomingPreAnswerHost? {
    val track by viewModel.selfPreviewTrack.collectAsStateWithLifecycle()
    if (!isVideoCall) return null
    return IncomingPreAnswerHost(
        selfTrack = track,
        eglContext = viewModel.eglBaseContext,
        selfUserId = viewModel.selfUserId,
        onCameraChosen = viewModel::setSelfPreviewOn,
        onAnswerMuted = viewModel::answerWithMicrophoneMuted,
    )
}

/**
 * Ma caméra d'aperçu ne tourne que pendant que l'écran entrant est VU et que Caméra est choisie : elle s'éteint quand
 * l'écran part, quand on coupe Caméra ou quand l'app passe en arrière-plan pendant la sonnerie, et se rallume au retour.
 */
@Composable
internal fun IncomingSelfCameraWhileSeen(cameraOn: Boolean, host: IncomingPreAnswerHost?) {
    LifecycleStartEffect(cameraOn) {
        if (cameraOn) host?.onCameraChosen?.invoke(true)
        onStopOrDispose { host?.onCameraChosen?.invoke(false) }
    }
}

/** P17.2 — la puce de verre « Appel vidéo entrant » et son icône caméra, AU-DESSUS du nom. */
@Composable
internal fun IncomingTypeChip(label: String, modifier: Modifier = Modifier) {
    CallGlassPlate(modifier = modifier.semantics(mergeDescendants = true) { }, shape = CircleShape) {
        Row(
            modifier = Modifier.padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.xs),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        ) {
            Icon(MeeshyIcons.Video, contentDescription = null, tint = CallPalette.Ink, modifier = Modifier.size(14.dp))
            Text(
                text = label,
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.SemiBold,
                color = CallPalette.Ink,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

/**
 * P17.4 et P17.5 — MA caméra en vignette portrait, au bord de fin : son liseré est à MA couleur (graine : mon
 * identifiant, jamais mon nom ; sans identifiant, le liseré blanc et fin déjà livré), une plaque « Vous » me désigne. Elle
 * n'existe que si la caméra filme vraiment ([IncomingCallChoices.showsSelfPreview]) et se fond dans les deux sens, d'un
 * fondu court sous « Réduire les animations ».
 */
@Composable
internal fun IncomingSelfPreview(
    host: IncomingPreAnswerHost,
    choice: IncomingPreAnswer,
    size: CallTileSize,
    reduceMotion: Boolean,
    modifier: Modifier = Modifier,
) {
    val shows = IncomingCallChoices.showsSelfPreview(isVideoCall = true, hasLocalVideoTrack = host.selfTrack != null, cameraChosen = choice.cameraOn)
    // Le dernier visage reste le temps du fondu de sortie : la piste est déjà éteinte quand la vignette finit de partir.
    val last = remember { arrayOfNulls<VideoTrack>(1) }
    host.selfTrack?.let { last[0] = it }
    val millis = IncomingCallChoices.selfPreviewFadeMillis(reduceMotion)
    AnimatedVisibility(visible = shows, modifier = modifier, enter = fadeIn(tween(millis)), exit = fadeOut(tween(millis))) {
        val track = host.selfTrack ?: last[0]
        if (track != null) {
            val shape = RoundedCornerShape(MeeshyRadius.lg)
            val rim = CallTileRim.selfTileBorder(
                paused = false,
                rimHex = IncomingCallChoices.selfColorKey(host.selfUserId)?.let(CallSpeakerColor::hex),
                warning = MeeshyTheme.tokens.warning,
            )
            val label = stringResource(R.string.call_incoming_self_preview_label)
            Box(
                Modifier
                    .size(size.widthDp.dp, size.heightDp.dp)
                    .shadow(MeeshySpacing.sm, shape)
                    .clip(shape)
                    .border(rim, shape)
                    .semantics { contentDescription = label },
            ) {
                VideoRenderer(track = track, eglContext = host.eglContext, modifier = Modifier.fillMaxSize(), mirror = true, overlay = true)
                // La plaque « Vous » de ma tuile de groupe (iOS `CallTileNameplate`) : la même capsule de verre.
                CallTileNameplate(
                    text = stringResource(R.string.call_group_tile_you),
                    modifier = Modifier
                        .align(Alignment.BottomCenter)
                        .padding(bottom = MeeshySpacing.xs)
                        .clearAndSetSemantics { },
                )
            }
        }
    }
}

/**
 * P17.6 à P17.8 — la barre de verre d'avant le décroché, presque pleine largeur, AU-DESSUS des boutons ronds : à gauche la
 * phrase de ce que l'autre recevra, à droite Micro puis Caméra. Un bouton actif est un disque blanc plein à icône sombre :
 * Micro l'est quand il est COUPÉ, Caméra quand elle FILME vraiment — choisie ET vivante, comme la phrase.
 */
@Composable
internal fun IncomingPreAnswerBar(
    peerName: String,
    choice: IncomingPreAnswer,
    hasLocalVideoTrack: Boolean,
    onToggleMicrophone: () -> Unit,
    onToggleCamera: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val exposure = choice.exposure(isVideoCall = true, hasLocalVideoTrack = hasLocalVideoTrack)
    val films = choice.cameraFilms(isVideoCall = true, hasLocalVideoTrack = hasLocalVideoTrack)
    val muted = !choice.microphoneOn
    CallGlassPlate(modifier = modifier.fillMaxWidth(), shape = RoundedCornerShape(MeeshyRadius.xlPlus)) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .defaultMinSize(minHeight = PRE_ANSWER_BAR_MIN_HEIGHT)
                .padding(start = MeeshySpacing.lg, end = MeeshySpacing.xs, top = MeeshySpacing.xxs, bottom = MeeshySpacing.xxs),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        ) {
            Text(
                text = incomingExposureText(exposure, peerName),
                style = MaterialTheme.typography.bodySmall,
                fontWeight = FontWeight.Medium,
                color = CallPalette.Ink,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            CallPillButton(
                icon = if (muted) MeeshyIcons.MicOff else MeeshyIcons.Mic,
                kind = if (muted) CallPillKind.Active else CallPillKind.Normal,
                label = stringResource(if (muted) R.string.call_control_unmute_label else R.string.call_control_mute_label),
                hint = stringResource(R.string.call_incoming_pre_answer_mic_hint, peerName),
                toggleState = muted,
                diameter = PRE_ANSWER_GLYPH,
                onClick = onToggleMicrophone,
            )
            CallPillButton(
                icon = if (films) MeeshyIcons.Video else MeeshyIcons.VideoOff,
                kind = if (films) CallPillKind.Active else CallPillKind.Normal,
                label = stringResource(if (choice.cameraOn) R.string.call_control_camera_off else R.string.call_control_camera_on),
                hint = stringResource(R.string.call_incoming_pre_answer_camera_hint, peerName),
                toggleState = films,
                diameter = PRE_ANSWER_GLYPH,
                onClick = onToggleCamera,
            )
        }
    }
}

/** P17.7 — les quatre phrases de la barre, selon ce que l'autre recevra VRAIMENT en décrochant. */
@Composable
private fun incomingExposureText(exposure: IncomingPreAnswer.Exposure, peerName: String): String = stringResource(
    when (exposure) {
        IncomingPreAnswer.Exposure.SeenAndHeard -> R.string.call_incoming_pre_answer_seen_and_heard
        IncomingPreAnswer.Exposure.HeardOnly -> R.string.call_incoming_pre_answer_heard_only
        IncomingPreAnswer.Exposure.SeenMuted -> R.string.call_incoming_pre_answer_seen_muted
        IncomingPreAnswer.Exposure.Neither -> R.string.call_incoming_pre_answer_neither
    },
    peerName,
)

private val PRE_ANSWER_BAR_MIN_HEIGHT = 56.dp
private val PRE_ANSWER_GLYPH = 40.dp
