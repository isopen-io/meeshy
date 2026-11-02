package me.meeshy.app.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import me.meeshy.feature.settings.R
import me.meeshy.sdk.model.account.ContactVerificationBadge
import me.meeshy.ui.component.chrome.MeeshyGlassSurface
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** Style de section commun de la page Sécurité : en-tête icône + titre teinté, puis carte de verre. */
@Composable
internal fun SecuritySectionCard(
    icon: ImageVector,
    title: String,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.semantics { heading() }) {
            Icon(icon, contentDescription = null, tint = MeeshyPalette.Indigo500, modifier = Modifier.size(18.dp))
            Spacer(Modifier.size(MeeshySpacing.sm))
            Text(
                text = title.uppercase(),
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.Bold,
                color = MeeshyPalette.Indigo500,
            )
        }
        MeeshyGlassSurface(shape = RoundedCornerShape(MeeshyRadius.lg), modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(MeeshySpacing.lg)) { content() }
        }
    }
}

/** Icône de champ de 28 dp, teintée. */
@Composable
internal fun SecurityFieldIcon(icon: ImageVector) {
    Icon(icon, contentDescription = null, tint = MeeshyPalette.Indigo500, modifier = Modifier.size(28.dp))
}

@Composable
internal fun SecurityCurrentValueRow(
    icon: ImageVector,
    label: String,
    value: String?,
    badge: ContactVerificationBadge?,
) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        SecurityFieldIcon(icon)
        Spacer(Modifier.size(MeeshySpacing.sm))
        Column(modifier = Modifier.weight(1f)) {
            Text(label, style = MaterialTheme.typography.labelSmall, color = MeeshyTheme.tokens.textMuted)
            Text(
                text = value?.takeIf { it.isNotBlank() } ?: stringResource(R.string.account_contact_not_set),
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Medium,
                color = if (value.isNullOrBlank()) MeeshyTheme.tokens.textMuted else MeeshyTheme.tokens.textPrimary,
            )
        }
        if (badge != null) SecurityVerificationBadge(badge)
    }
}

/** Capsule Vérifié (vert) / Non vérifié (orange) ; le libellé porte l'état, pas la seule couleur. */
@Composable
internal fun SecurityVerificationBadge(badge: ContactVerificationBadge) {
    val verified = badge == ContactVerificationBadge.VERIFIED
    Text(
        text = stringResource(if (verified) R.string.account_contact_verified else R.string.account_contact_not_verified),
        style = MaterialTheme.typography.labelSmall,
        fontWeight = FontWeight.Bold,
        color = MeeshyPalette.White,
        modifier = Modifier
            .clip(CircleShape)
            .background(if (verified) MeeshyPalette.Success else MeeshyPalette.Warning)
            .padding(horizontal = MeeshySpacing.sm, vertical = 2.dp),
    )
}

@Composable
internal fun SecurityErrorText(messageRes: Int?) {
    val res = messageRes ?: return
    Text(
        text = stringResource(res),
        style = MaterialTheme.typography.bodySmall,
        color = MeeshyPalette.Error,
        modifier = Modifier.padding(top = MeeshySpacing.sm).fillMaxWidth(),
        textAlign = TextAlign.Start,
    )
}
