package me.meeshy.app.reels

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import me.meeshy.ui.icons.MeeshyIcons
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import me.meeshy.ui.theme.MeeshyPalette

/**
 * The visual of an audio reel with no cover — port of iOS `ReelAudioBackdrop`: a canvas
 * tinted with the reel's accent and a waveform glyph, so the page never reads as a black,
 * silent screen while its sound plays.
 */
@Composable
internal fun ReelAudioCanvas(accent: Color, modifier: Modifier = Modifier) {
    Box(
        modifier = modifier.background(
            Brush.linearGradient(
                listOf(accent.copy(alpha = 0.85f), accent.copy(alpha = 0.45f), accent.copy(alpha = 0.85f)),
            ),
        ),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = MeeshyIcons.Waveform,
            contentDescription = null,
            tint = MeeshyPalette.White.copy(alpha = 0.85f),
            modifier = Modifier.size(120.dp),
        )
    }
}
