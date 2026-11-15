package me.meeshy.ui.component.bubble

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
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.sp

/**
 * L'avatar d'un invité SANS compte : un fantôme sur la couleur de l'auteur. La décision vient du
 * TYPE de l'auteur ([BubbleContent.senderIsAnonymous]), jamais d'un pseudo `ano_…`. Décoratif :
 * le statut est annoncé par l'étiquette parlée de la bulle.
 */
@Composable
internal fun BubbleSenderGhost(size: Dp, color: Color, modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .size(size)
            .clip(CircleShape)
            .background(color)
            .clearAndSetSemantics {},
        contentAlignment = Alignment.Center,
    ) {
        Text(text = GHOST_GLYPH, fontSize = (size.value * 0.5f).sp)
    }
}

private const val GHOST_GLYPH = "👻"
