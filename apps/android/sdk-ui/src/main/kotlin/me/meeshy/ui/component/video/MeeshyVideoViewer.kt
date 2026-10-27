package me.meeshy.ui.component.video

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.compose.ui.window.SecureFlagPolicy
import kotlinx.coroutines.delay
import me.meeshy.ui.R
import me.meeshy.ui.component.viewer.viewerDialogProperties
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshySpacing

/**
 * Le lecteur vidéo plein écran de Meeshy : une vidéo se regarde ICI, pas dans l'application système. Il joue
 * [mediaUrl] (par le cache disque de [ReelVideoSurface]), son audible, en entier dans l'écran. Un toucher met en
 * pause / reprend ; la barre de progression et la croix s'effacent après quelques secondes de lecture. Avec [secure], la fenêtre est exclue des captures (FLAG_SECURE) et le média ne passe pas par le cache disque. Un autre son
 * (vocal, appel) qui prend le focus met la lecture en pause, comme partout ailleurs.
 */
@Composable
public fun MeeshyVideoViewer(mediaUrl: String, onDismiss: () -> Unit, secure: Boolean = false) {
    Dialog(
        onDismissRequest = onDismiss,
        properties = viewerDialogProperties(secure),
    ) {
        var handle by remember { mutableStateOf<ReelPlayerHandle?>(null) }
        var paused by remember { mutableStateOf(false) }
        var controlsShown by remember { mutableStateOf(true) }
        var progress by remember { mutableFloatStateOf(0f) }
        val toggleTouch = remember { MutableInteractionSource() }

        LaunchedEffect(handle) {
            val live = handle ?: return@LaunchedEffect
            while (true) {
                val duration = live.durationMs()
                progress = if (duration > 0) (live.positionMs().toFloat() / duration).coerceIn(0f, 1f) else 0f
                delay(PROGRESS_TICK_MILLIS)
            }
        }
        LaunchedEffect(controlsShown, paused) {
            if (controlsShown && !paused) {
                delay(CONTROLS_HIDE_MILLIS)
                controlsShown = false
            }
        }
        DisposableEffect(Unit) { onDispose { handle = null } }

        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Color.Black)
                .clickable(interactionSource = toggleTouch, indication = null, role = Role.Button) {
                    paused = !paused
                    controlsShown = true
                },
            contentAlignment = Alignment.Center,
        ) {
            ReelVideoSurface(
                mediaUrl = mediaUrl,
                isActive = true,
                rewindWhenInactive = false,
                modifier = Modifier.fillMaxSize(),
                muted = false,
                paused = paused,
                fit = true,
                onPlayer = { handle = it },
                onAudioFocusLost = { paused = true; controlsShown = true },
                cached = !secure,
            )
            AnimatedVisibility(visible = paused, enter = fadeIn(), exit = fadeOut()) {
                Icon(
                    MeeshyIcons.PlayCircleFilled,
                    contentDescription = stringResource(R.string.fullscreen_play),
                    tint = Color.White,
                    modifier = Modifier.size(72.dp),
                )
            }
            AnimatedVisibility(
                visible = controlsShown,
                modifier = Modifier.align(Alignment.TopStart),
                enter = fadeIn(),
                exit = fadeOut(),
            ) {
                IconButton(
                    onClick = onDismiss,
                    modifier = Modifier
                        .statusBarsPadding()
                        .padding(MeeshySpacing.sm)
                        .clip(CircleShape)
                        .background(Color.Black.copy(alpha = 0.4f)),
                ) {
                    Icon(MeeshyIcons.Close, contentDescription = stringResource(R.string.fullscreen_close), tint = Color.White)
                }
            }
            AnimatedVisibility(
                visible = controlsShown,
                modifier = Modifier.align(Alignment.BottomCenter),
                enter = fadeIn(),
                exit = fadeOut(),
            ) {
                Row(Modifier.fillMaxWidth().navigationBarsPadding().padding(MeeshySpacing.lg)) {
                    LinearProgressIndicator(
                        progress = { progress },
                        color = Color.White,
                        trackColor = Color.White.copy(alpha = 0.3f),
                        modifier = Modifier.fillMaxWidth().padding(vertical = MeeshySpacing.sm),
                    )
                }
            }
        }
    }
}

private const val PROGRESS_TICK_MILLIS = 250L
private const val CONTROLS_HIDE_MILLIS = 3_000L
