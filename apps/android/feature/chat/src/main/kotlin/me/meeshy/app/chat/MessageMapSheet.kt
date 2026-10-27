package me.meeshy.app.chat

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.unit.dp
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.SharedPlace
import me.meeshy.sdk.model.location.PlaceLabels
import me.meeshy.ui.component.bubble.BubbleContent
import me.meeshy.ui.component.location.LocationMapPanel
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshySpacing

private val MAP_SHEET_HEIGHT = 460.dp

/**
 * La fiche « Carte » d'un message qui porte un lieu : la carte déplaçable avec le pin, ouvrir dans
 * l'application de cartes, itinéraire, et « Copier l'adresse » (le nom avant l'adresse, à défaut
 * les coordonnées — l'action du type « lieu » du menu iOS). Ne s'offre que sur un message
 * lisible : un message scellé de bout en bout ne porte aucun lieu dans la bulle.
 */
@Composable
internal fun MessageMapSheet(target: BubbleContent, accentHex: String?, modifier: Modifier = Modifier) {
    val place = target.locations.firstNotNullOfOrNull { OpenedPlace.of(target.messageId, it)?.place } ?: return
    val clipboard = LocalClipboardManager.current
    val haptic = LocalHapticFeedback.current
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        LocationMapPanel(
            place = place,
            accentColor = accentHex ?: ACCENT_FALLBACK,
            senderName = target.senderName.takeIf { target.showSenderName || !target.isOutgoing },
            onDismiss = null,
            modifier = Modifier.height(MAP_SHEET_HEIGHT),
        )
        TextButton(
            onClick = {
                clipboard.setText(AnnotatedString(PlaceLabels.copyableAddress(place)))
                haptic.performHapticFeedback(HapticFeedbackType.LongPress)
            },
            modifier = Modifier.align(Alignment.CenterHorizontally).padding(bottom = MeeshySpacing.sm),
        ) {
            Icon(MeeshyIcons.Copy, contentDescription = null, modifier = Modifier.size(16.dp))
            Text(
                stringResource(R.string.message_action_copyAddress),
                style = MaterialTheme.typography.labelLarge,
                modifier = Modifier.padding(start = MeeshySpacing.xsPlus),
            )
        }
    }
}

private const val ACCENT_FALLBACK = "6366F1"
