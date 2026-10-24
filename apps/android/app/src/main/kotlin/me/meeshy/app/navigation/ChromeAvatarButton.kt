package me.meeshy.app.navigation

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.chrome.unreadBadgeLabel
import me.meeshy.sdk.util.resolveServedImageUrl
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.component.chrome.FloatingButtonSize
import me.meeshy.ui.theme.MeeshyPalette

/**
 * The avatar's loadable address: the session stores a KEY (`avatars/user/<id>.jpg`), which
 * Coil cannot load as is — the button showed an empty ring. Resolved like every other media
 * against the API base; `null` when there is no photo. Pur, teste en JVM.
 */
internal fun chromeAvatarModel(avatar: String?, apiBaseUrl: String): String? =
    resolveServedImageUrl(avatar, apiBaseUrl)

/**
 * Couleurs du disque du bouton droit : parite iOS — indigo600->indigo300 quand l'echelle est
 * fermee, error->indigo300 quand elle est deployee (le SEUL signal qui change ; l'avatar, lui,
 * reste toujours affiche). Pur, teste en JVM.
 */
internal fun chromeAvatarRingColors(menuExpanded: Boolean): List<Color> = if (menuExpanded) {
    listOf(MeeshyPalette.Error, MeeshyPalette.Indigo300)
} else {
    listOf(MeeshyPalette.Indigo600, MeeshyPalette.Indigo300)
}

/** L'avatar dans le disque : `MeeshyAvatar(context: .custom(38))` iOS — l'anneau degrade fait 7 dp. */
internal const val CHROME_AVATAR_SIZE_DP: Float = 38f

/** La pastille de non-lus : seulement echelle FERMEE et compteur positif (iOS `!showMenu && unreadCount > 0`). */
internal fun chromeBadgeVisible(menuExpanded: Boolean, unreadCount: Int): Boolean = !menuExpanded && unreadCount > 0

/** Decalage de la pastille depuis le centre du disque (`NotificationBadge.offset(x: 16, y: -16)`). */
internal const val CHROME_BADGE_OFFSET_DP: Float = 16f

/**
 * Le bouton droit : un disque degrade plein (l'anneau) autour de l'avatar de l'utilisateur
 * courant — photo ou initiales, jamais remplace par un FAB generique — et la pastille rouge
 * des notifications non lues. Le libelle et la valeur TalkBack sont portes par le disque
 * flottant lui-meme ([me.meeshy.ui.component.chrome.FloatingButtonSemantics]).
 */
@Composable
internal fun ChromeAvatarButton(user: MeeshyUser?, avatarUrl: String?, unreadCount: Int, menuExpanded: Boolean) {
    val displayName = user?.effectiveDisplayName.orEmpty()
    Box(modifier = Modifier.size(FloatingButtonSize), contentAlignment = Alignment.Center) {
        Box(
            modifier = Modifier
                .matchParentSize()
                .background(Brush.linearGradient(chromeAvatarRingColors(menuExpanded)), CircleShape),
        )
        // One face: the photo once loaded, its initials standing in until then — never an empty ring.
        MeeshyAvatar(name = displayName, size = CHROME_AVATAR_SIZE_DP.dp, imageUrl = avatarUrl)
        if (chromeBadgeVisible(menuExpanded, unreadCount)) {
            ChromeNotificationBadge(
                count = unreadCount,
                modifier = Modifier.offset(x = CHROME_BADGE_OFFSET_DP.dp, y = (-CHROME_BADGE_OFFSET_DP).dp),
            )
        }
    }
}

/** `NotificationBadge` iOS : capsule rouge de 18 dp, s'elargit au lieu de rogner « 99+ ». */
@Composable
private fun ChromeNotificationBadge(count: Int, modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .defaultMinSize(minWidth = 18.dp, minHeight = 18.dp)
            .shadow(3.dp, RoundedCornerShape(50), ambientColor = MeeshyPalette.Error, spotColor = MeeshyPalette.Error)
            .background(MeeshyPalette.Error, RoundedCornerShape(50))
            .padding(horizontal = 6.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = unreadBadgeLabel(count),
            color = MeeshyPalette.White,
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.SemiBold,
            maxLines = 1,
        )
    }
}
