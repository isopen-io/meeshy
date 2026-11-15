package me.meeshy.app.calls

import android.content.res.Resources
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.graphics.Color

/**
 * La durée qui se redessine ELLE-MÊME (miroir de iOS `CallDurationClock`) : seul ce texte lit les secondes
 * vivantes, donc seul lui se recompose à 1 Hz ; l'écran, l'en-tête et la puce restent immobiles. Sa phrase
 * parlée ([CallSpokenDuration]) est son état, fondu dans la sémantique de la puce.
 */
@Composable
internal fun CallDurationClockText(
    hasLiveClock: Boolean,
    fixedSeconds: Long,
    fixedLabel: String?,
    color: Color,
    modifier: Modifier = Modifier,
) {
    val seconds = liveOrFixedSeconds(hasLiveClock, LocalCallLiveSeconds.current, fixedSeconds)
    val resources: Resources = LocalContext.current.resources
    val spoken = remember(seconds, resources) { CallSpokenDuration.spoken(resources, seconds) }
    val clock = if (hasLiveClock) clockLabel(seconds) else fixedLabel.orEmpty()
    Text(
        text = clock,
        style = MaterialTheme.typography.labelSmall.copy(fontFeatureSettings = "tnum"),
        fontWeight = FontWeight.Medium,
        color = color,
        modifier = modifier.semantics { stateDescription = spoken },
    )
}
