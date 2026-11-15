package me.meeshy.app.notifications

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import me.meeshy.ui.theme.MeeshyTheme

private val THUMB_SHAPE = RoundedCornerShape(8.dp)

/**
 * La vignette 44 dp du contenu lié : contour fin, et un fond d'accent teinté qui reste si l'image échoue —
 * l'échec est silencieux (aucun bouton « réessayer » sur 44 dp). Décorative pour TalkBack.
 */
@Composable
internal fun NotificationRowThumbnail(url: String, accent: Color, modifier: Modifier = Modifier) {
    AsyncImage(
        model = url,
        contentDescription = null,
        contentScale = ContentScale.Crop,
        modifier = modifier
            .size(44.dp)
            .clip(THUMB_SHAPE)
            .background(accent.copy(alpha = 0.12f))
            .border(0.5.dp, MeeshyTheme.tokens.textMuted.copy(alpha = 0.12f), THUMB_SHAPE)
            .clearAndSetSemantics { },
    )
}
