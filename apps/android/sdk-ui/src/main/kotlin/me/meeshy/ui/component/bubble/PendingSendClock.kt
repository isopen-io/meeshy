package me.meeshy.ui.component.bubble

import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription

/**
 * L'horloge d'un message en cours d'envoi, hors d'une bulle : le même glyphe et la même teinte que [DeliveryStatusIcon]
 * à l'état [DeliveryStatus.Pending] (iOS `PendingSendClock`, `BubbleDeliveryCheck .sending`). Une publication encore
 * dans la file la montre à la place de son heure ; [description] est ce que le lecteur d'écran en dit.
 */
@Composable
fun PendingSendClock(color: Color, description: String, modifier: Modifier = Modifier) {
    Box(modifier.clearAndSetSemantics { contentDescription = description }) {
        DeliveryStatusIcon(status = DeliveryStatus.Pending, metaColor = color, isSlow = false)
    }
}
