package me.meeshy.ui.component

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import me.meeshy.ui.R
import me.meeshy.ui.theme.MeeshyPalette

/**
 * Circular initials avatar (charte graphique §13.7). The [containerColor] is
 * typically the conversation accent colour; semantics expose [name] to TalkBack.
 */
@Composable
public fun MeeshyAvatar(
    name: String,
    modifier: Modifier = Modifier,
    size: Dp = 48.dp,
    containerColor: Color = MeeshyPalette.Indigo500,
    contentColor: Color = MeeshyPalette.White,
) {
    val textSize = with(LocalDensity.current) { (size * 0.4f).toSp() }
    val fallbackDescription = stringResource(R.string.avatar_fallback)
    Box(
        modifier = modifier
            .size(size)
            .clip(CircleShape)
            .background(containerColor)
            .semantics { contentDescription = name.ifBlank { fallbackDescription } },
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = avatarInitials(name),
            color = contentColor,
            fontWeight = FontWeight.Bold,
            fontSize = textSize,
        )
    }
}
