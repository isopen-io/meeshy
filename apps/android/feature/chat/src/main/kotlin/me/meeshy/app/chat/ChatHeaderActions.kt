package me.meeshy.app.chat

import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.clickable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.avatar.AvatarContext
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.component.chrome.MeeshyGlassSurface
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Le bouton « Partager » de l'en-tête (iOS `ConversationShareLinkButton`, #10206) : même gabarit que
 * le bouton d'appel voisin, ouvre la feuille de partage du système sur l'adresse publique.
 */
@Composable
internal fun ChatHeaderShareButton(url: String, accentColor: Color) {
    val context = LocalContext.current
    ChatHeaderGlassAction(
        icon = MeeshyIcons.Share,
        contentDescription = stringResource(R.string.chat_header_share),
        accentColor = accentColor,
        onClick = { context.startActivity(shareChooser(url)) },
    )
}

private fun shareChooser(url: String): Intent {
    val send = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_TEXT, url)
    }
    return Intent.createChooser(send, null).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
}

/**
 * L'en-tête d'un invité sans compte (iOS `ConversationGuestHeaderBar`, #10205) : le titre, le lien à
 * transmettre, l'avatar de la conversation — qui n'ouvre rien — et la fermeture. Ni effectif, ni
 * détail, ni fiche : aucune porte qui répondrait 403 à un invité.
 */
@Composable
internal fun ChatGuestHeaderBar(
    title: String,
    avatarUrl: String?,
    shareUrl: String?,
    accentColor: Color,
    onClose: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val tokens = MeeshyTheme.tokens
    MeeshyGlassSurface(
        modifier = modifier.fillMaxWidth().padding(horizontal = MeeshySpacing.sm, vertical = MeeshySpacing.sm),
        shape = androidx.compose.foundation.shape.RoundedCornerShape(MeeshySpacing.lg),
        tint = accentColor.copy(alpha = 0.15f),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(start = MeeshySpacing.md, end = MeeshySpacing.xs),
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = title,
                modifier = Modifier.weight(1f),
                style = MaterialTheme.typography.titleMedium,
                color = tokens.textPrimary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (shareUrl != null) ChatHeaderShareButton(url = shareUrl, accentColor = accentColor)
            Box(Modifier.clearAndSetSemantics { }) {
                MeeshyAvatar(
                    name = title,
                    context = AvatarContext.ConversationHeaderCollapsed,
                    containerColor = accentColor,
                    isUser = false,
                    imageUrl = avatarUrl,
                )
            }
            val closeLabel = stringResource(R.string.chat_guest_bar_close)
            Box(
                modifier = Modifier
                    .size(48.dp)
                    .clip(CircleShape)
                    .clickable(role = Role.Button, onClick = onClose)
                    .clearAndSetSemantics {
                        contentDescription = closeLabel
                        role = Role.Button
                    },
                contentAlignment = Alignment.Center,
            ) {
                Box(Modifier.size(28.dp).background(tokens.textSecondary.copy(alpha = 0.15f), CircleShape), contentAlignment = Alignment.Center) {
                    Icon(MeeshyIcons.Close, contentDescription = null, tint = tokens.textSecondary, modifier = Modifier.size(12.dp))
                }
            }
        }
    }
}
