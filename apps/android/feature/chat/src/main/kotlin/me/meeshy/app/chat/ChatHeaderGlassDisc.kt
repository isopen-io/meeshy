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
import androidx.compose.ui.graphics.SolidColor
import me.meeshy.ui.component.chrome.MeeshyGlassSurface

/**
 * Le disque de verre des actions de l'en-tête (action générique, talkie, Bring) : UNE seule recette, teintée par
 * l'action, avec un fond optionnel quand l'action est active (le talkie qui parle, le Bring qui sonne).
 */
@Composable
internal fun ChatHeaderGlassDisc(
    tint: Color,
    fill: Brush = SolidColor(Color.Transparent),
    content: @Composable BoxScope.() -> Unit,
) {
    MeeshyGlassSurface(
        modifier = Modifier.size(ChatHeaderMetrics.ACTION_GLASS),
        shape = CircleShape,
        tint = tint,
    ) {
        Box(
            Modifier
                .size(ChatHeaderMetrics.ACTION_GLASS)
                .clip(CircleShape)
                .background(fill),
            contentAlignment = Alignment.Center,
            content = content,
        )
    }
}
