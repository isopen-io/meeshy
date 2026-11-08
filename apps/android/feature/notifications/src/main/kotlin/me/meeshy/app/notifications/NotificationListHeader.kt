package me.meeshy.app.notifications

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import me.meeshy.feature.notifications.R
import me.meeshy.ui.component.chrome.CollapsibleHeader
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing

/**
 * L'en-tête de la cloche : titre qui se replie au défilement ([scrollOffsetDp] suit la convention
 * iOS, 0 au repos puis négatif), flèche retour indigo, « Tout lire » SEULEMENT s'il reste des non
 * lues d'après le compteur serveur, puis le libellé « N non lues » en couleur de marque.
 */
@Composable
internal fun NotificationListHeader(
    scrollOffsetDp: Float,
    unreadCount: Int,
    onBack: () -> Unit,
    onMarkAllRead: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val hasUnread = unreadCount > 0
    Column(modifier) {
        CollapsibleHeader(
            title = stringResource(R.string.notifications_title),
            scrollOffsetDp = scrollOffsetDp,
            onBack = onBack,
            backArrowColor = MeeshyPalette.Indigo500,
            actionsVisible = hasUnread,
            actions = {
                if (hasUnread) {
                    IconButton(onClick = onMarkAllRead) {
                        Icon(
                            imageVector = MeeshyIcons.CheckCircle,
                            contentDescription = stringResource(R.string.notifications_mark_all_read),
                            tint = MeeshyPalette.Indigo500,
                        )
                    }
                }
            },
        )
        AnimatedVisibility(
            visible = hasUnread,
            enter = fadeIn(tween(200)) + expandVertically(tween(200)),
            exit = fadeOut(tween(150)) + shrinkVertically(tween(150)),
        ) {
            Text(
                text = pluralStringResource(R.plurals.notifications_unread_count, unreadCount, unreadCount),
                style = MaterialTheme.typography.bodySmall,
                color = MeeshyPalette.Indigo500,
                modifier = Modifier.fillMaxWidth().padding(vertical = MeeshySpacing.xs),
                textAlign = TextAlign.Center,
            )
        }
    }
}
