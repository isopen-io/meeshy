package me.meeshy.app.settings

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import me.meeshy.feature.settings.R
import me.meeshy.sdk.model.session.SessionRowPresentation
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Une session : l'appareil, son logiciel, son lieu approximatif, son fuseau, son ouverture et son activité.
 * Le bloc informatif est UN élément TalkBack ; « Déconnecter » reste une action distincte qui nomme l'appareil.
 */
@Composable
internal fun ActiveSessionRow(
    row: SessionRowPresentation,
    texts: SessionRowTexts,
    isRevoking: Boolean,
    onRevoke: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val tint = if (row.isCurrent) MeeshyPalette.Success else MeeshyPalette.Indigo400
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(MeeshyRadius.lg),
        color = tint.copy(alpha = ROW_FILL_ALPHA),
        border = BorderStroke(1.dp, tint.copy(alpha = ROW_BORDER_ALPHA)),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = MeeshySpacing.mdPlus, vertical = MeeshySpacing.md),
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
            verticalAlignment = Alignment.Top,
        ) {
            Row(
                modifier = Modifier.weight(1f).semantics(mergeDescendants = true) {},
                horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
            ) {
                Box(
                    modifier = Modifier
                        .size(32.dp)
                        .clip(RoundedCornerShape(MeeshyRadius.xs))
                        .background(tint.copy(alpha = ICON_FILL_ALPHA)),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(sessionIcon(row.icon), contentDescription = null, tint = tint, modifier = Modifier.size(18.dp))
                }
                Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs)) {
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xsPlus),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            text = texts.title,
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.SemiBold,
                            color = MeeshyTheme.tokens.textPrimary,
                            modifier = Modifier.weight(1f, fill = false),
                        )
                        if (row.isCurrent) CurrentBadge()
                    }
                    texts.details.forEach { line ->
                        Text(
                            text = line,
                            style = MaterialTheme.typography.bodySmall,
                            color = MeeshyTheme.tokens.textSecondary,
                        )
                    }
                }
            }
            if (!row.isCurrent) RevokeButton(title = texts.title, enabled = !isRevoking, onClick = onRevoke)
        }
    }
}

@Composable
private fun CurrentBadge() {
    Text(
        text = stringResource(R.string.sessions_current_badge),
        style = MaterialTheme.typography.labelSmall,
        fontWeight = FontWeight.Bold,
        color = MeeshyPalette.White,
        modifier = Modifier
            .clip(CircleShape)
            .background(MeeshyPalette.Success)
            .padding(horizontal = MeeshySpacing.xsPlus, vertical = MeeshySpacing.xxs),
    )
}

@Composable
private fun RevokeButton(title: String, enabled: Boolean, onClick: () -> Unit) {
    val label = stringResource(R.string.sessions_revoke_a11y, title)
    Box(
        modifier = Modifier
            .defaultMinSize(minWidth = 48.dp, minHeight = 48.dp)
            .clip(RoundedCornerShape(MeeshyRadius.pill))
            .clickable(enabled = enabled, role = Role.Button, onClick = onClick)
            .semantics { contentDescription = label }
            .padding(horizontal = MeeshySpacing.xs),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = stringResource(R.string.sessions_revoke),
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.SemiBold,
            color = MeeshyPalette.Error.copy(alpha = if (enabled) 1f else DISABLED_ALPHA),
        )
    }
}

private fun sessionIcon(icon: SessionRowPresentation.Icon): ImageVector = when (icon) {
    SessionRowPresentation.Icon.TABLET -> MeeshyIcons.TabletAndroid
    SessionRowPresentation.Icon.PHONE -> MeeshyIcons.PhoneAndroid
    SessionRowPresentation.Icon.DESKTOP -> MeeshyIcons.Computer
    SessionRowPresentation.Icon.ANDROID_APP -> MeeshyIcons.Android
    SessionRowPresentation.Icon.WEB -> MeeshyIcons.Language
}

private const val ROW_FILL_ALPHA = 0.08f
private const val ROW_BORDER_ALPHA = 0.25f
private const val ICON_FILL_ALPHA = 0.12f
private const val DISABLED_ALPHA = 0.5f
