package me.meeshy.app.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import me.meeshy.ui.component.chrome.MeeshyGlassSurface

/**
 * Le cercle de verre de 28 des actions de l'en-tête (iOS `MeeshyControlSize.small`), teinté de [tint] à 40 % : UN seul
 * site pour l'action, le talkie et le Bring, que le cliquet du verre compte une fois. [fill] remplit le disque quand
 * l'action est vivante (dégradé du talkie qui parle, rouge du Bring qui sonne).
 */
@Composable
internal fun ChatHeaderGlassDisc(
    tint: Color,
    fill: Brush? = null,
    content: @Composable BoxScope.() -> Unit,
) {
    MeeshyGlassSurface(
        modifier = Modifier.size(ChatHeaderMetrics.ACTION_GLASS),
        shape = CircleShape,
        tint = tint.copy(alpha = 0.4f),
    ) {
        Box(
            modifier = Modifier
                .size(ChatHeaderMetrics.ACTION_GLASS)
                .then(if (fill == null) Modifier else Modifier.clip(CircleShape).background(fill)),
            contentAlignment = Alignment.Center,
            content = content,
        )
    }
}
