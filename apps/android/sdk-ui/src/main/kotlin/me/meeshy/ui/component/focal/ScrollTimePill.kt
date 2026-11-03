package me.meeshy.ui.component.focal

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import me.meeshy.ui.theme.MeeshyFontSize
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.boundedScale

public const val ScrollTimePillTag: String = "scroll-time-pill"

/** Le fondu de la pilule (iOS `FocalMetrics.Pill.fadeDuration`, 0,28 s). */
public const val ScrollTimePillFadeMs: Int = 280

/**
 * La pilule « Aujourd'hui · 14:32 » du fil (iOS `ScrollTimePillOverlay`) : matière fine, liseré
 * indigo, non interactive (aucun toucher) et cachée de TalkBack. [label] et [isVisible] sont lus
 * dans la pilule seule : une valeur qui change ne recompose pas l'hôte. Le dernier libellé reste
 * affiché pendant le fondu de sortie.
 */
@Composable
public fun ScrollTimePill(
    label: () -> String?,
    isVisible: () -> Boolean,
    modifier: Modifier = Modifier,
) {
    val current = label()
    var lastLabel by remember { mutableStateOf(current) }
    if (current != null) lastLabel = current
    AnimatedVisibility(
        visible = isVisible() && current != null,
        enter = fadeIn(tween(ScrollTimePillFadeMs)),
        exit = fadeOut(tween(ScrollTimePillFadeMs)),
        modifier = modifier.testTag(ScrollTimePillTag).clearAndSetSemantics { },
    ) {
        val isDark = MeeshyTheme.isDark
        val shape = RoundedCornerShape(MeeshyRadius.pill)
        Text(
            text = lastLabel.orEmpty(),
            fontSize = MeeshyFontSize.subhead.boundedScale(max = 1f),
            fontWeight = FontWeight.SemiBold,
            color = if (isDark) MeeshyPalette.Indigo200 else MeeshyPalette.Indigo700,
            modifier = Modifier
                .clip(shape)
                .background(MeeshyTheme.tokens.backgroundPrimary.copy(alpha = if (isDark) 0.6f else 0.7f))
                .border(0.5.dp, if (isDark) MeeshyPalette.Indigo900 else MeeshyPalette.Indigo200, shape)
                .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.xs),
        )
    }
}
