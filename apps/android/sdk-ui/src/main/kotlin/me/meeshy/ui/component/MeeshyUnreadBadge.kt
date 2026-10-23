package me.meeshy.ui.component

import androidx.compose.foundation.background
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import me.meeshy.ui.theme.MeeshyFontSize
import me.meeshy.sdk.model.chrome.UnreadBadge
import me.meeshy.ui.R
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.NunitoFontFamily

/**
 * Pastille rouge chiffree d'une rangee de conversation (iOS `UnreadCountBadge`) : un objet de FLUX, sans
 * animation ni decalage. Le portillon vit ICI : a zero ou en negatif elle ne rend RIEN et n'occupe aucune
 * place, si bien qu'aucune rangee n'a a ecrire `if (unread > 0)`. Au-dela de 99 elle affiche « 99+ »,
 * mais TalkBack lit le vrai compte (« N non lus »).
 */
@Composable
public fun MeeshyUnreadBadge(
    count: Int,
    modifier: Modifier = Modifier,
    isDark: Boolean = isSystemInDarkTheme(),
) {
    val text = UnreadBadge.displayedText(count) ?: return
    val spoken = UnreadBadge.spokenCount(count)
    val description = pluralStringResource(R.plurals.unread_badge_description, spoken, spoken)
    val color = MeeshyPalette.unreadBadgeBackground(isDark)
    Box(
        modifier = modifier
            .defaultMinSize(minWidth = UnreadBadge.MINIMUM_SIZE.dp, minHeight = UnreadBadge.MINIMUM_SIZE.dp)
            .shadow(UnreadBadge.SHADOW_RADIUS.dp, CircleShape, ambientColor = color.copy(alpha = UnreadBadge.SHADOW_OPACITY), spotColor = color.copy(alpha = UnreadBadge.SHADOW_OPACITY))
            .background(color, CircleShape)
            .padding(horizontal = UnreadBadge.HORIZONTAL_PADDING.dp, vertical = UnreadBadge.VERTICAL_PADDING.dp)
            .semantics { contentDescription = description },
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = text,
            color = MeeshyPalette.White,
            fontFamily = NunitoFontFamily,
            fontWeight = FontWeight.Bold,
            fontSize = MeeshyFontSize.small,
            maxLines = 1,
        )
    }
}
