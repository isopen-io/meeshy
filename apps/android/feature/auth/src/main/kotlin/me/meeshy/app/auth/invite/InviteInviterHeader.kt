package me.meeshy.app.auth.invite

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import me.meeshy.feature.auth.R
import me.meeshy.sdk.model.InviteInviter
import me.meeshy.sdk.theme.DynamicColorGenerator
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.hexColor

/**
 * Qui invite et ce qu'il a écrit : l'avatar à double anneau (blanc puis dégradé de marque),
 * « Priya t'invite », @pseudo, puis le message dans une bulle dont le coin supérieur du côté de
 * départ est resserré à 6 dp (et passe à droite en RTL). Miroir de `InviteInviterHeader` (iOS).
 */
@Composable
internal fun InviteInviterHeader(inviter: InviteInviter, isDark: Boolean, modifier: Modifier = Modifier) {
    val rtl = LocalLayoutDirection.current == LayoutDirection.Rtl
    val bubble = RoundedCornerShape(
        topStart = if (rtl) MeeshyRadius.xl else 6.dp,
        topEnd = if (rtl) 6.dp else MeeshyRadius.xl,
        bottomStart = MeeshyRadius.xl,
        bottomEnd = MeeshyRadius.xl,
    )
    Column(modifier = modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md)) {
        Row(
            modifier = Modifier.semantics(mergeDescendants = true) {},
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Avatar(inviter, isDark)
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs)) {
                Text(
                    text = stringResource(R.string.invite_landing_inviter_invites, inviter.firstName),
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.ExtraBold,
                    fontFamily = FontFamily.SansSerif,
                    color = InviteInk.title(isDark),
                )
                Text(
                    text = "@${inviter.username}",
                    style = MaterialTheme.typography.labelLarge,
                    color = InviteInk.muted(isDark),
                    maxLines = 1,
                )
            }
        }
        inviter.message?.let { text ->
            Text(
                text = text,
                modifier = Modifier
                    .fillMaxWidth()
                    .shadow(8.dp, bubble, ambientColor = MeeshyPalette.Indigo900.copy(alpha = if (isDark) 0f else 0.08f), spotColor = MeeshyPalette.Indigo900.copy(alpha = if (isDark) 0f else 0.08f))
                    .background(if (isDark) MeeshyPalette.Indigo900.copy(alpha = 0.55f) else Color.White, bubble)
                    .border(1.dp, InviteInk.hairline(isDark), bubble)
                    .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.mdPlus),
                style = MaterialTheme.typography.bodyMedium,
                color = InviteInk.title(isDark),
            )
        }
    }
}

@Composable
private fun Avatar(inviter: InviteInviter, isDark: Boolean) {
    Row(
        modifier = Modifier
            .background(Brush.linearGradient(listOf(MeeshyPalette.Indigo500, MeeshyPalette.Indigo700)), CircleShape)
            .padding(2.dp)
            .background(if (isDark) MeeshyPalette.Indigo950 else Color.White, CircleShape)
            .padding(2.dp)
            .clearAndSetSemantics {},
    ) {
        MeeshyAvatar(
            name = inviter.displayName,
            size = 52.dp,
            imageUrl = inviter.avatarUrl,
            containerColor = hexColor(DynamicColorGenerator.colorForName(inviter.displayName), MeeshyPalette.Indigo500),
        )
    }
}
