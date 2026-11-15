package me.meeshy.ui.component.audio

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.MarqueeAnimationMode
import androidx.compose.foundation.basicMarquee
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.TextUnit
import me.meeshy.ui.accessibility.LocalReduceMotion

/**
 * Le crédit d'un son sur UNE ligne : il défile quand il dépasse la place, et se fige quand le son est coupé ou que
 * l'utilisateur a demandé de réduire les animations (iOS `AudioChipMarquee`, `paused`).
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
public fun CreditMarquee(
    text: String,
    tint: Color,
    fontSize: TextUnit,
    paused: Boolean,
    modifier: Modifier = Modifier,
) {
    val still = paused || LocalReduceMotion.current
    Text(
        text = text,
        color = tint,
        fontSize = fontSize,
        fontWeight = FontWeight.SemiBold,
        maxLines = 1,
        softWrap = false,
        modifier = modifier.basicMarquee(
            iterations = if (still) 0 else Int.MAX_VALUE,
            animationMode = MarqueeAnimationMode.Immediately,
        ),
    )
}
