package me.meeshy.app.calls

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import me.meeshy.ui.theme.MeeshySpacing

/** La pastille « type d'appel » (audio / vidéo), partagée par la sonnerie et l'appel entrant (iOS `CallTypeBadgeView`). */
@Composable
internal fun CallTypeBadge(isVideo: Boolean, label: String, modifier: Modifier = Modifier) {
    Row(
        modifier = modifier
            .clip(CircleShape)
            .background(CallPalette.Brand.copy(alpha = 0.15f))
            .border(BorderStroke(1.dp, CallPalette.Brand.copy(alpha = 0.3f)), CircleShape)
            .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.xs),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = if (isVideo) Icons.Filled.Videocam else Icons.Filled.Call,
            contentDescription = null,
            tint = CallPalette.Brand,
            modifier = Modifier.size(12.dp),
        )
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.SemiBold,
            color = CallPalette.Brand,
        )
    }
}
