package me.meeshy.app.navigation

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.chrome.unreadBadgeLabel
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.theme.MeeshyPalette

/**
 * `true` quand l'avatar doit afficher la PHOTO plutot que les initiales — une URL
 * vide ou blanche n'est pas une photo. Pur, teste en JVM.
 */
internal fun chromeAvatarUsesPhoto(avatarUrl: String?): Boolean = !avatarUrl.isNullOrBlank()

/**
 * Couleurs de l'anneau du bouton droit au repos : parite iOS — indigo600->indigo300
 * quand l'echelle est fermee, error->indigo300 quand elle est deployee (le SEUL
 * signal qui change ; l'avatar, lui, reste toujours affiche). Pur, teste en JVM.
 */
internal fun chromeAvatarRingColors(menuExpanded: Boolean): List<Color> = if (menuExpanded) {
    listOf(MeeshyPalette.Error, MeeshyPalette.Indigo300)
} else {
    listOf(MeeshyPalette.Indigo600, MeeshyPalette.Indigo300)
}

/**
 * Le bouton droit au repos : l'avatar (photo ou initiales) de l'utilisateur
 * courant, jamais remplace par un FAB generique — corrige le bug ou l'avatar
 * disparaissait pendant que l'echelle etait ouverte (seul l'anneau recolore, iOS
 * fait de meme). Source : [me.meeshy.sdk.session.SessionRepository.currentUser],
 * qui expose photo/nom/id — `AuthUiState` n'expose que le nom d'utilisateur.
 */
@Composable
internal fun ChromeAvatarButton(user: MeeshyUser?, unreadCount: Int, menuExpanded: Boolean) {
    val avatarUrl = user?.avatar
    val displayName = user?.effectiveDisplayName.orEmpty()
    Box(contentAlignment = Alignment.Center) {
        Box(
            modifier = Modifier
                .size(52.dp)
                .border(2.5.dp, Brush.linearGradient(chromeAvatarRingColors(menuExpanded)), CircleShape)
                .padding(3.dp),
            contentAlignment = Alignment.Center,
        ) {
            if (chromeAvatarUsesPhoto(avatarUrl)) {
                AsyncImage(
                    model = avatarUrl,
                    contentDescription = null,
                    modifier = Modifier.size(44.dp).clip(CircleShape),
                    contentScale = ContentScale.Crop,
                )
            } else {
                MeeshyAvatar(name = displayName, size = 44.dp)
            }
        }
        if (!menuExpanded && unreadCount > 0) {
            Box(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .clip(CircleShape)
                    .background(MeeshyPalette.ErrorStrong)
                    .padding(horizontal = 4.dp, vertical = 2.dp),
            ) {
                Text(unreadBadgeLabel(unreadCount), color = MeeshyPalette.White, style = MaterialTheme.typography.labelSmall)
            }
        }
    }
}
