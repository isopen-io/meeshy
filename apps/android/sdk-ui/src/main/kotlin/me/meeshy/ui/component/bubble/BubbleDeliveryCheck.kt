package me.meeshy.ui.component.bubble

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import me.meeshy.sdk.model.BubbleSendProgress
import me.meeshy.sdk.model.DeliveryGlyphState
import me.meeshy.sdk.model.DeliveryGlyphs
import me.meeshy.sdk.model.SendLifecycleResolver
import me.meeshy.ui.theme.MeeshyPalette

/**
 * La coche unique de tous les pieds de bulle (iOS `BubbleDeliveryCheck`). L'horloge d'un envoi frais
 * attend [SendLifecycleResolver.SENDING_REVEAL_DELAY_MILLIS] ; toucher la coche appelle [onShowReadStatus].
 */
@Composable
internal fun BubbleDeliveryCheck(
    state: DeliveryGlyphState,
    isOffline: Boolean,
    metaColor: Color,
    readTint: Color,
    sendStartedAtIso: String?,
    uploadPieces: List<BubbleSendProgress.Piece> = emptyList(),
    onShowReadStatus: (() -> Unit)? = null,
    modifier: Modifier = Modifier,
) {
    val inFlight = (state == DeliveryGlyphState.Sending || state == DeliveryGlyphState.Slow) && !isOffline
    val revealed = if (state == DeliveryGlyphState.Sending && !isOffline) rememberSendingGlyphRevealed(sendStartedAtIso) else true
    val tap = if (onShowReadStatus == null) {
        modifier
    } else {
        modifier.clickable(onClick = onShowReadStatus).semantics { role = Role.Button }
    }
    val uploads = LocalUploadProgress.current
    val clock: @Composable () -> Unit = {
        DeliveryGlyphIcon(
            glyph = DeliveryGlyphs.resolve(state, isOffline, sendingRevealed = revealed),
            metaColor = metaColor,
            readTint = readTint,
        )
    }
    Box(tap) {
        if (inFlight && uploads != null && uploadPieces.isNotEmpty()) {
            SendProgressPill(
                pieces = uploadPieces,
                source = uploads,
                color = if (state == DeliveryGlyphState.Slow) MeeshyPalette.Warning else metaColor,
                fallback = clock,
            )
        } else {
            clock()
        }
    }
}
