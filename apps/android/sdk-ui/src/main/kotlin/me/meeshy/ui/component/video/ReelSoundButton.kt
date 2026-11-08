package me.meeshy.ui.component.video

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import me.meeshy.ui.R
import me.meeshy.ui.component.fullscreen.FullscreenChromeButton
import me.meeshy.ui.icons.MeeshyIcons

/**
 * Le bouton haut-parleur d'une vidéo du fil ou d'un réel (iOS `ReelFeedSoundButton`) : le disque du chrome
 * plein écran, l'icône suit le son RÉEL ([isSoundAudible], jamais l'intention seule), et le libellé TalkBack
 * décrit l'ACTION du toucher, pas l'état courant.
 */
@Composable
public fun ReelSoundButton(
    isSoundAudible: Boolean,
    onToggle: () -> Unit,
    modifier: Modifier = Modifier,
) {
    FullscreenChromeButton(
        icon = if (isSoundAudible) MeeshyIcons.VolumeUp else MeeshyIcons.VolumeOff,
        label = stringResource(if (isSoundAudible) R.string.a11y_feed_video_sound_mute else R.string.a11y_feed_video_sound_unmute),
        onClick = onToggle,
        modifier = modifier,
        isActive = isSoundAudible,
    )
}
