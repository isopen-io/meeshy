package me.meeshy.app.conversations

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.layout.Column
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.conversationlist.ConversationSearchCommunitiesBandLaw

internal const val SEARCH_DOCK_BAND_TAG = "conversation-search-dock-band"
internal const val SEARCH_DOCK_SYNC_TAG = "conversation-search-dock-sync"

private const val HIDE_SLIDE_DP = 150
private const val HIDE_MILLIS = 250
private val EaseOut = CubicBezierEasing(0f, 0f, 0.58f, 1f)

/**
 * Le pied de la liste : emplacement amarré pour la pastille de synchro (au
 * plancher, au-dessus de la barre), bande des communautés (au focus, requête
 * vide, communautés non vides) puis la barre. Le masquage glisse de 150 dp et
 * s'estompe en 0,25 s, comme iOS.
 */
@Composable
internal fun ConversationSearchDock(
    visible: Boolean,
    isFocused: Boolean,
    query: String,
    communityCount: Int,
    modifier: Modifier = Modifier,
    syncPill: @Composable () -> Unit = {},
    communitiesBand: @Composable () -> Unit = {},
    bar: @Composable () -> Unit,
) {
    val slidePx = with(LocalDensity.current) { HIDE_SLIDE_DP.dp.roundToPx() }
    val bandShown = isFocused && ConversationSearchCommunitiesBandLaw.drawsBand(communityCount, query.isEmpty())
    AnimatedVisibility(
        visible = visible,
        modifier = modifier,
        enter = slideInVertically(tween(HIDE_MILLIS, easing = EaseOut)) { slidePx } +
            fadeIn(tween(HIDE_MILLIS, easing = EaseOut)),
        exit = slideOutVertically(tween(HIDE_MILLIS, easing = EaseOut)) { slidePx } +
            fadeOut(tween(HIDE_MILLIS, easing = EaseOut)),
    ) {
        Column {
            Column(modifier = Modifier.testTag(SEARCH_DOCK_SYNC_TAG)) { syncPill() }
            AnimatedVisibility(visible = bandShown) {
                Column(modifier = Modifier.testTag(SEARCH_DOCK_BAND_TAG)) { communitiesBand() }
            }
            bar()
        }
    }
}
