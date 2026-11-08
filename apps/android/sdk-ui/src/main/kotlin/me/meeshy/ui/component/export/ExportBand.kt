package me.meeshy.ui.component.export

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.union
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntRect
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Popup
import androidx.compose.ui.window.PopupPositionProvider
import androidx.compose.ui.window.PopupProperties
import me.meeshy.ui.theme.MeeshySpacing

const val EXPORT_BAND_TAG = "export-band"

object ExportBandTiming {
    /** Le temps où l'issue reste à l'écran — allongé par le système pour qui lit à l'aide de TalkBack. */
    const val OUTCOME_MILLIS = 4_000L
}

/**
 * **La fenêtre du bandeau d'export** (#13897, #13951) : posée en bas de la fenêtre, elle ne prend ni le focus ni les gestes — l'écran
 * reste utilisable, le retour système lui appartient. Elle ne reçoit pas les encarts de l'écran : ils se lisent chez
 * l'HÔTE, puis se portent dans la fenêtre, pour que la bande se tienne au-dessus de la barre de navigation.
 */
@Composable
fun ExportBandWindow(content: @Composable ColumnScope.() -> Unit) {
    val hostNavigation = WindowInsets.navigationBars
    Popup(
        popupPositionProvider = WindowBottom,
        properties = PopupProperties(focusable = false, dismissOnBackPress = false, dismissOnClickOutside = false),
    ) {
        Column(
            modifier = Modifier.windowInsetsPadding(hostNavigation.union(WindowInsets.navigationBars)),
            horizontalAlignment = Alignment.CenterHorizontally,
            content = content,
        )
    }
}

/** La surface du bandeau, partagée par la progression du compositeur et par l'annonce de fin. */
@Composable
fun ExportBandSurface(content: @Composable RowScope.() -> Unit) {
    Surface(
        shape = RoundedCornerShape(BAND_RADIUS),
        color = MaterialTheme.colorScheme.surfaceVariant,
        tonalElevation = BAND_ELEVATION,
        shadowElevation = BAND_ELEVATION,
        modifier = Modifier
            .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.md)
            .fillMaxWidth()
            .testTag(EXPORT_BAND_TAG),
    ) {
        Row(
            modifier = Modifier.padding(start = MeeshySpacing.lg, end = MeeshySpacing.sm),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
            content = content,
        )
    }
}

/** L'issue d'un export : son texte, lu poliment ; un échec, lu sans attendre, avec le geste qui le relance. */
@Composable
fun ExportOutcomeBand(message: String, failed: Boolean, retryLabel: String?, onRetry: () -> Unit) {
    ExportBandSurface {
        Text(
            text = message,
            style = MaterialTheme.typography.titleSmall,
            modifier = Modifier
                .weight(1f)
                .padding(vertical = MeeshySpacing.lg)
                .semantics { liveRegion = if (failed) LiveRegionMode.Assertive else LiveRegionMode.Polite },
        )
        if (retryLabel != null) TextButton(onClick = onRetry) { Text(retryLabel) }
    }
}

/** Le bas de la FENÊTRE, quel que soit l'endroit où l'hôte monte le bandeau : la racine de l'app comme un écran. */
private object WindowBottom : PopupPositionProvider {
    override fun calculatePosition(anchorBounds: IntRect, windowSize: IntSize, layoutDirection: LayoutDirection, popupContentSize: IntSize) =
        IntOffset((windowSize.width - popupContentSize.width) / 2, windowSize.height - popupContentSize.height)
}

private val BAND_RADIUS = 16.dp
private val BAND_ELEVATION = 6.dp
