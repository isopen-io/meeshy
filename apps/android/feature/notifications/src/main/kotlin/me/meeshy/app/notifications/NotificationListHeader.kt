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
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import me.meeshy.feature.notifications.R
import me.meeshy.sdk.model.accessibility.MotionSpecs
import me.meeshy.ui.component.chrome.CollapsibleHeader
import me.meeshy.ui.component.chrome.ScrollMotionVisibility
import me.meeshy.ui.component.kit.MeeshyChipRecipe
import me.meeshy.ui.motion.MeeshyAnimatedVisibility
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing

/**
 * L'en-tête de la cloche : titre qui se replie au défilement ([scrollOffsetDp] suit la convention
 * iOS, 0 au repos puis négatif), flèche retour indigo, « Tout lire » SEULEMENT s'il reste des non
 * lues d'après le compteur serveur, puis le libellé « N non lues » en couleur de marque. La coche et le libellé
 * s'effacent jusqu'au bout quand tout est lu, le libellé gardant son dernier compte pendant sa sortie.
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
                AnimatedVisibility(
                    visible = hasUnread,
                    enter = fadeIn(tween(ScrollMotionVisibility.FADE_DURATION_MS)),
                    exit = fadeOut(tween(ScrollMotionVisibility.FADE_DURATION_MS)),
                ) {
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
        MeeshyAnimatedVisibility(
            value = unreadCount.takeIf { it > 0 },
            enter = fadeIn(tween(UNREAD_LABEL_IN_MILLIS)) + expandVertically(tween(UNREAD_LABEL_IN_MILLIS)),
            exit = fadeOut(tween(UNREAD_LABEL_OUT_MILLIS)) + shrinkVertically(tween(UNREAD_LABEL_OUT_MILLIS)),
            label = "notifications-unread-count",
        ) { count ->
            Text(
                text = pluralStringResource(R.plurals.notifications_unread_count, count, count),
                style = MaterialTheme.typography.bodySmall,
                color = MeeshyPalette.Indigo500,
                modifier = Modifier.fillMaxWidth().padding(vertical = MeeshySpacing.xs).testTag(UNREAD_COUNT_TAG),
                textAlign = TextAlign.Center,
            )
        }
    }
}

/** Le libellé arrive au pas du fondu d'état du kit (200 ms) et repart au fondu court (150 ms) ; réduit : fondu seul. */
private const val UNREAD_LABEL_IN_MILLIS = MeeshyChipRecipe.TONE_FADE_MILLIS
private const val UNREAD_LABEL_OUT_MILLIS = MotionSpecs.REDUCED_FADE_MILLIS

internal const val UNREAD_COUNT_TAG = "notifications.unread.count"
