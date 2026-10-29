package me.meeshy.app.calls

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Hearing
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.MicOff
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material.icons.filled.VideocamOff
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VolumeOff
import androidx.compose.material.icons.filled.VolumeUp
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import me.meeshy.feature.calls.R
import me.meeshy.sdk.model.call.CallPreviewExposure
import me.meeshy.ui.motion.pressable
import me.meeshy.ui.theme.MeeshySpacing
import org.webrtc.EglBase
import org.webrtc.VideoTrack

private const val PREVIEW_SCRIM_ALPHA = 0.45f

/**
 * Chez l'appelé : la vidéo de l'appelant plein écran DERRIÈRE l'écran de sonnerie (iOS
 * `CallPreviewBackdrop`), voilée de noir pour que le nom, Refuser et Répondre restent lisibles.
 * Décorative : TalkBack ne la parcourt pas.
 */
@Composable
internal fun CallPreviewBackdrop(track: VideoTrack, eglContext: EglBase.Context, modifier: Modifier = Modifier) {
    Box(modifier = modifier.fillMaxSize().clearAndSetSemantics { }) {
        VideoRenderer(track = track, eglContext = eglContext, modifier = Modifier.fillMaxSize())
        Box(Modifier.fillMaxSize().background(CallPalette.Veil.copy(alpha = PREVIEW_SCRIM_ALPHA)))
    }
}

/**
 * Chez l'appelé : entendre l'appelant avant de décrocher (iOS `CallPreviewSoundButton`). Plein et
 * blanc tant que le son est coupé — on ne peut pas le manquer —, de verre une fois activé ; le
 * libellé dit le geste suivant, TalkBack lit l'état « sélectionné » et l'indication.
 */
@Composable
internal fun CallPreviewSoundButton(isAudible: Boolean, onToggle: () -> Unit, modifier: Modifier = Modifier) {
    val label = stringResource(if (isAudible) R.string.call_preview_sound_off else R.string.call_preview_sound_on)
    val hint = stringResource(R.string.call_preview_sound_hint)
    val ink = if (isAudible) Color.White else Color.Black
    Row(
        modifier = modifier
            .pressable()
            .defaultMinSize(minHeight = 50.dp)
            .clip(CircleShape)
            .background(if (isAudible) Color.White.copy(alpha = 0.16f) else Color.White)
            .clickable(onClickLabel = hint, role = Role.Button, onClick = onToggle)
            .semantics {
                contentDescription = label
                selected = isAudible
            }
            .padding(horizontal = MeeshySpacing.xxl),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        Icon(
            imageVector = if (isAudible) Icons.Filled.VolumeUp else Icons.Filled.VolumeOff,
            contentDescription = null,
            tint = ink,
            modifier = Modifier.size(20.dp),
        )
        Text(
            text = label,
            style = MaterialTheme.typography.bodyLarge,
            fontWeight = FontWeight.SemiBold,
            color = ink,
            modifier = Modifier.clearAndSetSemantics { },
        )
    }
}

/** Ce que l'appelé reçoit VRAIMENT de l'appelant avant de décrocher, ou rien (iOS `CallPreviewSeenLabel.text`). */
@Composable
internal fun callPreviewSeenText(peerName: String, exposure: CallPreviewExposure): String? = when (exposure) {
    CallPreviewExposure.Nothing -> null
    CallPreviewExposure.Seen -> stringResource(R.string.call_preview_seen_by, peerName)
    CallPreviewExposure.Heard -> stringResource(R.string.call_preview_heard_by, peerName)
    CallPreviewExposure.SeenAndHeard -> stringResource(R.string.call_preview_heard_and_seen_by, peerName)
}

/**
 * Chez l'appelant qui sonne : la capsule « X vous voit avant de décrocher » puis les deux bascules
 * micro et caméra de l'aperçu (iOS `CallPreviewSeenLabel` + `CallPreviewOutgoingControls`). Micro
 * coupé et caméra activée pour un contact jamais appelé ; le choix est retenu pour CE contact.
 */
@Composable
internal fun CallPreviewOutgoingPanel(
    preview: CallPreviewUi,
    peerName: String,
    isVideoCall: Boolean,
    onToggleAudio: () -> Unit,
    onToggleVideo: () -> Unit,
    modifier: Modifier = Modifier,
) {
    if (!preview.offersOutgoingControls) return
    val name = callPeerTitle(peerName)
    Column(modifier = modifier, horizontalAlignment = Alignment.CenterHorizontally) {
        callPreviewSeenText(name, preview.calleeExposure)?.let { text ->
            CallPreviewSeenCapsule(text = text, exposure = preview.calleeExposure)
            Spacer(Modifier.height(MeeshySpacing.lg))
        }
        Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xxl)) {
            CallPreviewToggle(
                isOn = preview.outgoingConsent.sendsAudio,
                on = Icons.Filled.Mic,
                off = Icons.Filled.MicOff,
                caption = stringResource(R.string.call_control_mute_caption),
                label = stringResource(R.string.call_preview_mic_a11y),
                hint = stringResource(R.string.call_preview_mic_hint, name),
                onToggle = onToggleAudio,
            )
            if (isVideoCall) {
                CallPreviewToggle(
                    isOn = preview.outgoingConsent.sendsVideo,
                    on = Icons.Filled.Videocam,
                    off = Icons.Filled.VideocamOff,
                    caption = stringResource(R.string.call_control_video_caption),
                    label = stringResource(R.string.call_preview_camera_a11y),
                    hint = stringResource(R.string.call_preview_camera_hint, name),
                    onToggle = onToggleVideo,
                )
            }
        }
    }
}

@Composable
private fun CallPreviewSeenCapsule(text: String, exposure: CallPreviewExposure) {
    Row(
        modifier = Modifier
            .clip(CircleShape)
            .background(Color.White.copy(alpha = 0.12f))
            .semantics(mergeDescendants = true) { }
            .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        Icon(
            imageVector = if (exposure == CallPreviewExposure.Seen) Icons.Filled.Visibility else Icons.Filled.Hearing,
            contentDescription = null,
            tint = CallPalette.InkSecondary,
            modifier = Modifier.size(14.dp),
        )
        Text(
            text = text,
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.Medium,
            color = CallPalette.InkSecondary,
            textAlign = TextAlign.Center,
        )
    }
}

/** Une bascule de l'aperçu : cercle de 64 dp, état lu par TalkBack comme un interrupteur. */
@Composable
private fun CallPreviewToggle(
    isOn: Boolean,
    on: ImageVector,
    off: ImageVector,
    caption: String,
    label: String,
    hint: String,
    onToggle: () -> Unit,
) {
    Column(
        modifier = Modifier
            .toggleable(value = isOn, role = Role.Switch, onValueChange = { onToggle() })
            .semantics(mergeDescendants = true) {
                contentDescription = "$label. $hint"
                onClick(label = hint) { onToggle(); true }
            },
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            modifier = Modifier
                .pressable()
                .size(64.dp)
                .clip(CircleShape)
                .background(if (isOn) Color.White else Color.White.copy(alpha = 0.16f)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = if (isOn) on else off,
                contentDescription = null,
                tint = if (isOn) CallPalette.BrandDeep else Color.White,
            )
        }
        Spacer(Modifier.height(MeeshySpacing.xs))
        Text(
            text = caption,
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.Medium,
            color = CallPalette.InkMuted,
            modifier = Modifier.clearAndSetSemantics { },
        )
    }
}
