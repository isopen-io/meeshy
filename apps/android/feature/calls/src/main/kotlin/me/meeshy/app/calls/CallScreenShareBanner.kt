package me.meeshy.app.calls

import android.content.ActivityNotFoundException
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import me.meeshy.feature.calls.R
import me.meeshy.sdk.model.call.screenshare.CallScreenSharePhase
import me.meeshy.ui.component.chrome.MeeshyGlassSurface
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Le partage d'écran sur l'écran d'appel (#13332), comme iOS `CallScreenShareBanner` : « Vous partagez
 * votre écran · Arrêter » chez le partageur, « Alice partage son écran » chez l'autre. Il porte aussi le
 * dialogue système de consentement, lancé une fois par demande — même après une rotation.
 */
@Singleton
class CallScreenShareBannerOverlay @Inject constructor(
    private val controller: CallScreenShareController,
) : CallOverlay {
    override val id: String = "call-screen-share"
    override val slot: CallOverlaySlot = CallOverlaySlot.TopBanner
    override val priority: Int = 90

    @Composable
    override fun Content(context: CallOverlayContext) {
        val share by controller.state.collectAsState()
        ScreenShareConsentRequest(share, controller::onConsent)
        val modifier = Modifier.padding(top = MeeshySpacing.sm)
        when {
            share.phase == CallScreenSharePhase.Sharing -> ScreenShareBanner(
                text = stringResource(R.string.call_screen_share_local_banner),
                onStop = controller::toggle,
                modifier = modifier,
            )
            context.state.isPeerScreenSharing -> ScreenShareBanner(
                text = context.state.peerName.takeIf { it.isNotBlank() }
                    ?.let { stringResource(R.string.call_screen_share_remote_banner, it) }
                    ?: stringResource(R.string.call_screen_share_remote_banner_generic),
                onStop = null,
                modifier = modifier,
            )
        }
    }
}

@Composable
private fun ScreenShareConsentRequest(share: CallScreenShareUi, onConsent: (MediaProjectionConsent) -> Unit) {
    val launcher = rememberLauncherForActivityResult(RequestMediaProjectionConsent(), onConsent)
    var launched by rememberSaveable { mutableIntStateOf(0) }
    LaunchedEffect(share.asksConsent, share.consentRequest) {
        if (!share.asksConsent || share.consentRequest == launched) return@LaunchedEffect
        launched = share.consentRequest
        try {
            launcher.launch(Unit)
        } catch (_: ActivityNotFoundException) {
            onConsent(MediaProjectionConsent.Denied)
        }
    }
}

@Composable
private fun ScreenShareBanner(text: String, onStop: (() -> Unit)?, modifier: Modifier = Modifier) {
    MeeshyGlassSurface(
        modifier = modifier.semantics { liveRegion = LiveRegionMode.Polite },
        shape = CircleShape,
        tint = MeeshyPalette.Error.copy(alpha = BANNER_TINT_ALPHA),
    ) {
        Row(
            modifier = Modifier
                .defaultMinSize(minHeight = BANNER_MIN_HEIGHT)
                .padding(start = MeeshySpacing.mdPlus, end = if (onStop == null) MeeshySpacing.mdPlus else MeeshySpacing.xs),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.smPlus),
        ) {
            Icon(MeeshyIcons.FlipToFront, contentDescription = null, tint = MeeshyPalette.Error, modifier = Modifier.size(16.dp))
            Text(
                text = text,
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.Medium,
                color = Color.White,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (onStop != null) ScreenShareStopButton(onStop)
        }
    }
}

@Composable
private fun ScreenShareStopButton(onStop: () -> Unit) {
    val label = stringResource(R.string.call_screen_share_stop)
    Box(
        modifier = Modifier
            .defaultMinSize(minWidth = BANNER_MIN_HEIGHT, minHeight = BANNER_MIN_HEIGHT)
            .clip(CircleShape)
            .clickable(onClickLabel = label, role = Role.Button, onClick = onStop)
            .padding(horizontal = MeeshySpacing.md),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = stringResource(R.string.call_screen_share_stop_caption),
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.SemiBold,
            color = Color.White,
            modifier = Modifier.semantics { this.contentDescription = label },
        )
    }
}

private const val BANNER_TINT_ALPHA = 0.35f
private val BANNER_MIN_HEIGHT = 44.dp
