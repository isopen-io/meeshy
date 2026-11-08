package me.meeshy.ui.component.bubble

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.testTag
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.MeeshyMediaConsumption
import me.meeshy.sdk.model.media.VideoResumeBar
import me.meeshy.ui.theme.MeeshyOpacity
import me.meeshy.ui.theme.MeeshySpacing

internal const val MEDIA_CONSUMPTION_BAR_TAG = "mediaConsumptionBar"

/**
 * La barre de reprise de 3 dp en bas du poster d'une vidéo (iOS `MediaConsumptionProgressBar`) : la fraction déjà
 * regardée, en [accent], sur un fond noir à 28 %. Invisible sous 1 %. [localFraction] gagne dès qu'il existe ;
 * [served] (la consommation de la passerelle) ne comble que son absence. Ne capte aucun toucher, muette pour TalkBack.
 */
@Composable
internal fun MediaConsumptionProgressBar(
    accent: Color,
    modifier: Modifier = Modifier,
    localFraction: Double? = null,
    served: MeeshyMediaConsumption? = null,
    totalDurationSeconds: Double = 0.0,
) {
    val fraction = VideoResumeBar.fraction(localFraction, served, totalDurationSeconds) ?: return
    Box(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = MeeshySpacing.xsPlus)
            .padding(bottom = MeeshySpacing.xsPlus)
            .height(3.dp)
            .clip(CircleShape)
            .background(Color.Black.copy(alpha = 0.28f))
            .clearAndSetSemantics { testTag = MEDIA_CONSUMPTION_BAR_TAG },
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth(fraction.toFloat())
                .height(3.dp)
                .clip(CircleShape)
                .background(accent.copy(alpha = MeeshyOpacity.intense)),
        )
    }
}
