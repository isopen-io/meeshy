package me.meeshy.app.calls

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.MicOff
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.dp
import me.meeshy.ui.theme.MeeshySpacing

private const val BADGE_SCRIM_ALPHA = 0.45f

/**
 * Le micro coupé du correspondant, posé SUR son image en vidéo (en haut au centre de la grande
 * image, au coin de la vignette après une permutation). Hors du chrome qui s'efface : il reste
 * tant que le micro du pair est coupé. Muet pour TalkBack — la puce de durée et la sémantique
 * de l'écran le disent (miroir de iOS `CallPeerMutedBadge`).
 */
@Composable
internal fun CallPeerMutedBadge(compact: Boolean, modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .clip(CircleShape)
            .background(CallPalette.Veil.copy(alpha = BADGE_SCRIM_ALPHA))
            .padding(if (compact) MeeshySpacing.xs else MeeshySpacing.sm)
            .clearAndSetSemantics { },
    ) {
        Icon(
            imageVector = Icons.Filled.MicOff,
            contentDescription = null,
            tint = CallPalette.Ink,
            modifier = Modifier.size(if (compact) 12.dp else 18.dp),
        )
    }
}
