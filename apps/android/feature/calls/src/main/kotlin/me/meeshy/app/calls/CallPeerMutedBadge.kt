package me.meeshy.app.calls

import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.MicOff
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.dp
import me.meeshy.ui.theme.MeeshySpacing

/**
 * Le micro coupé du correspondant, posé SUR son image en vidéo (en haut au centre de la grande image, au coin de la vignette
 * après une permutation ; planche E2). Un disque du verre de l'écran d'appel sous son voile de ton (loi 18.1), hors du chrome
 * qui s'efface : il reste tant que le micro du pair est coupé. Muet pour TalkBack — la puce de durée et la sémantique de
 * l'écran le disent (miroir de iOS `CallPeerMutedBadge`).
 */
@Composable
internal fun CallPeerMutedBadge(compact: Boolean, modifier: Modifier = Modifier) {
    CallGlassPlate(
        modifier = modifier.clearAndSetSemantics { },
        shape = CircleShape,
    ) {
        CallToneScrim()
        Icon(
            imageVector = Icons.Filled.MicOff,
            contentDescription = null,
            tint = CallPalette.Ink,
            modifier = Modifier
                .padding(if (compact) MeeshySpacing.xs else MeeshySpacing.sm)
                .size(if (compact) 12.dp else 18.dp),
        )
    }
}
