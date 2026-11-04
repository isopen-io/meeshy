package me.meeshy.ui.component.focal

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import me.meeshy.sdk.theme.DynamicColorGenerator
import me.meeshy.ui.R
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.component.bubble.BubbleContent
import me.meeshy.ui.component.bubble.BubbleSenderGhost
import me.meeshy.ui.component.rememberConversationHere
import me.meeshy.ui.component.rememberPresence
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.hexColor

/** HAUT-GAUCHE : l'auteur à un gabarit plus grand (avatar 26, nom 13,5, hauteur 34) — « Toi » pour moi. */
@Composable
internal fun FocalIdentityChip(content: BubbleContent, accent: Color, onSenderTap: (() -> Unit)?) {
    val you = stringResource(R.string.focal_row_you)
    val senderName = content.senderName?.takeIf { it.isNotBlank() }
    val senderColor = remember(content.senderColorHex, senderName) {
        val hex = content.senderColorHex ?: senderName?.let(DynamicColorGenerator::colorForName)
        hex?.let { hexColor(it, MeeshyPalette.Indigo500) } ?: MeeshyPalette.Indigo500
    }
    val nameColor = when {
        content.isOutgoing -> MeeshyPalette.Indigo500
        MeeshyTheme.isDark -> Color.White.copy(alpha = 0.92f)
        else -> Color.Black.copy(alpha = 0.88f)
    }
    FocusChip(accent = accent, height = ElectedMetrics.identityHeight, onClick = onSenderTap) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xsPlus)) {
            if (content.senderIsAnonymous) {
                BubbleSenderGhost(size = ElectedMetrics.identityAvatar, color = senderColor)
            } else {
                MeeshyAvatar(
                    name = senderName ?: you,
                    size = ElectedMetrics.identityAvatar,
                    containerColor = senderColor,
                    imageUrl = content.senderAvatarUrl,
                    presence = rememberPresence(content.senderProfile?.userId),
                    here = rememberConversationHere(content.senderProfile?.userId, content.viewingConversationId),
                    decorRing = content.senderRing,
                )
            }
            Text(
                text = if (content.isOutgoing) you else senderName ?: "",
                fontSize = ElectedMetrics.identityNameSp,
                fontWeight = FontWeight.ExtraBold,
                color = nameColor,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}
