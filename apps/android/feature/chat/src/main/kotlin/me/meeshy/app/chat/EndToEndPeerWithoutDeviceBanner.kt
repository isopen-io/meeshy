package me.meeshy.app.chat

import android.widget.Toast
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.expandVertically
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import me.meeshy.feature.chat.R
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.motion.MeeshyAnimatedVisibility
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Au-dessus du compositeur d'un tête-à-tête chiffré de bout en bout dont le pair n'a aucun appareil chiffré (#20076,
 * miroir d'iOS `EndToEndPeerWithoutDeviceBanner`) : la phrase qui le dit, et l'action qui ouvre le tête-à-tête lisible.
 */
@Composable
internal fun EndToEndPeerWithoutDeviceBannerHost(controller: EndToEndPeerWithoutDeviceController?, accentColor: Color) {
    val banner by (controller?.banner ?: NO_BANNER).collectAsStateWithLifecycle()
    MeeshyAnimatedVisibility(
        value = banner,
        enter = expandVertically() + fadeIn(),
        exit = shrinkVertically() + fadeOut(),
        label = "e2ee-peer-without-device-banner",
    ) { shown ->
        EndToEndPeerWithoutDeviceBanner(shown, accentColor, onWritePlain = { controller?.writePlain() })
    }
}

@Composable
private fun EndToEndPeerWithoutDeviceBanner(banner: PeerWithoutDeviceBanner, accentColor: Color, onWritePlain: () -> Unit) {
    val title = if (banner.peerFirstName.isEmpty()) {
        stringResource(R.string.chat_e2ee_peer_without_device_title_anonymous)
    } else {
        stringResource(R.string.chat_e2ee_peer_without_device_title, banner.peerFirstName)
    }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(MeeshyTheme.tokens.backgroundSecondary)
            .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.xs)
            .testTag(BANNER_TAG),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(MeeshyIcons.LockOpen, contentDescription = null, tint = MeeshyPalette.Warning, modifier = Modifier.size(16.dp))
        Text(
            text = title,
            style = MaterialTheme.typography.bodySmall,
            color = MeeshyTheme.tokens.textSecondary,
            modifier = Modifier.weight(1f),
        )
        TextButton(
            onClick = onWritePlain,
            enabled = !banner.isOpening,
            modifier = Modifier.heightIn(min = 48.dp).testTag(WRITE_PLAIN_TAG),
        ) {
            if (banner.isOpening) {
                CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp, color = accentColor)
            } else {
                Text(
                    text = stringResource(R.string.chat_e2ee_peer_without_device_write_plain),
                    style = MaterialTheme.typography.bodySmall,
                    fontWeight = FontWeight.SemiBold,
                    color = accentColor,
                )
            }
        }
    }
}

/**
 * Le tête-à-tête lisible que le contrôleur demande d'ouvrir (le bandeau, ou un envoi redirigé), et l'avis d'une ouverture
 * impossible. Monté par l'écran du fil, qui seul sait naviguer.
 */
@Composable
internal fun EndToEndPeerWithoutDeviceEffect(controller: EndToEndPeerWithoutDeviceController?, onOpenConversation: (String) -> Unit) {
    val context = LocalContext.current
    val offline = stringResource(R.string.chat_e2ee_readable_direct_offline)
    val failed = stringResource(R.string.chat_e2ee_readable_direct_failed)
    val open by rememberUpdatedState(onOpenConversation)
    LaunchedEffect(controller) { controller?.openRequests?.collect { open(it) } }
    LaunchedEffect(controller, offline, failed) {
        controller?.notices?.collect { notice ->
            val text = if (notice == PeerWithoutDeviceNotice.OFFLINE) offline else failed
            Toast.makeText(context, text, Toast.LENGTH_LONG).show()
        }
    }
}

private val NO_BANNER: StateFlow<PeerWithoutDeviceBanner?> = MutableStateFlow(null)
private const val BANNER_TAG = "conversation.e2ee.peerWithoutDevice"
private const val WRITE_PLAIN_TAG = "conversation.e2ee.peerWithoutDevice.writePlain"
