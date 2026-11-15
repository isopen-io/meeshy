package me.meeshy.ui.component.permission

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Contacts
import androidx.compose.material.icons.filled.Image
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.PhotoCamera
import androidx.compose.material.icons.filled.Save
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.PermissionNature
import me.meeshy.ui.component.MeeshyPrimaryButton
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Le corps commun de la feuille d'explication et de la carte de refus : l'icône de l'accès, un
 * titre, un corps, l'action principale et une sortie. Le titre et le corps forment UN seul
 * bloc annoncé par TalkBack à l'apparition ; chaque bouton garde sa cible d'au moins 48 dp.
 */
@Composable
internal fun PermissionPanel(
    nature: PermissionNature,
    title: String,
    body: String,
    primaryLabel: String,
    onPrimary: () -> Unit,
    secondaryLabel: String,
    onSecondary: () -> Unit,
    accent: Color,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = MeeshySpacing.xxl, vertical = MeeshySpacing.xl),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.lg),
    ) {
        Box(
            modifier = Modifier
                .size(56.dp)
                .clip(CircleShape)
                .background(accent.copy(alpha = 0.16f)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(imageVector = nature.icon(), contentDescription = null, tint = accent)
        }
        Column(
            modifier = Modifier.semantics(mergeDescendants = true) { liveRegion = LiveRegionMode.Polite },
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        ) {
            Text(
                text = title,
                modifier = Modifier.semantics { heading() },
                color = MeeshyTheme.tokens.textPrimary,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                textAlign = TextAlign.Center,
            )
            Text(
                text = body,
                color = MeeshyTheme.tokens.textSecondary,
                style = MaterialTheme.typography.bodyMedium,
                textAlign = TextAlign.Center,
            )
        }
        MeeshyPrimaryButton(text = primaryLabel, onClick = onPrimary, modifier = Modifier.fillMaxWidth())
        TextButton(
            onClick = onSecondary,
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 48.dp),
        ) {
            Text(text = secondaryLabel, color = MeeshyTheme.tokens.textSecondary)
        }
    }
}

private fun PermissionNature.icon(): ImageVector = when (this) {
    PermissionNature.MICROPHONE -> Icons.Filled.Mic
    PermissionNature.CAMERA -> Icons.Filled.PhotoCamera
    PermissionNature.PHOTO_LIBRARY_READ -> Icons.Filled.Image
    PermissionNature.PHOTO_LIBRARY_ADD -> Icons.Filled.Save
    PermissionNature.LOCATION -> Icons.Filled.LocationOn
    PermissionNature.NOTIFICATIONS -> Icons.Filled.Notifications
    PermissionNature.CONTACTS -> Icons.Filled.Contacts
}
