package me.meeshy.app.conversations

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntRect
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.window.Popup
import androidx.compose.ui.window.PopupPositionProvider
import kotlinx.coroutines.delay
import me.meeshy.feature.conversations.R
import me.meeshy.sdk.model.PresenceLastSeen
import me.meeshy.ui.component.LocalPresenceStore
import me.meeshy.ui.theme.MeeshyOpacity
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.R as UiR

/** Un libellé affiché; une identité par toucher, pour que le deuxième toucher relance les deux secondes. */
internal class LastSeenTip(val seen: PresenceLastSeen)

/**
 * Ce que la cellule d'avatar sait faire du toucher du point: lire la dernière activité de [peerUserId] dans la
 * carte de présence au MOMENT du toucher (rien n'est abonné), l'afficher [ConversationRowLastSeen.VISIBLE_MILLIS].
 */
internal class LastSeenTipState(
    private val read: () -> PresenceLastSeen?,
) {
    var tip: LastSeenTip? by mutableStateOf(null)
        private set

    fun show() {
        tip = read()?.let(::LastSeenTip)
    }

    fun hide() {
        tip = null
    }
}

@Composable
internal fun rememberLastSeenTip(peerUserId: String?): LastSeenTipState {
    val store = LocalPresenceStore.current
    val state = remember(store, peerUserId) {
        LastSeenTipState(read = {
            if (store == null || peerUserId == null) null
            else ConversationRowLastSeen.of(store.entries.value[peerUserId], store.nowMillis())
        })
    }
    val tip = state.tip
    LaunchedEffect(tip) {
        if (tip == null) return@LaunchedEffect
        delay(ConversationRowLastSeen.VISIBLE_MILLIS)
        state.hide()
    }
    return state
}

/**
 * L'action TalkBack « Voir la dernière activité »: elle se FUSIONNE dans la rangée (un seul bouton), l'avatar n'est pas
 * un nœud à part. Le toucher du point, lui, vit dans l'atome (son paramètre `onDotTap`).
 */
@Composable
internal fun Modifier.lastSeenAccessibilityAction(state: LastSeenTipState): Modifier {
    val actionLabel = stringResource(R.string.row_a11y_last_seen_action)
    return semantics {
        customActions = listOf(CustomAccessibilityAction(actionLabel) { state.show(); true })
    }
}

/** La bulle noire au-dessus de l'avatar (iOS: capsule noire à `MeeshyOpacity.heavy`, texte blanc, légende grasse). */
@Composable
internal fun LastSeenTooltip(tip: LastSeenTip?) {
    if (tip == null) return
    val text = lastSeenText(tip.seen)
    val gap = with(LocalDensity.current) { MeeshySpacing.xs.roundToPx() }
    val position = remember(gap) { AboveAnchor(gap) }
    Popup(popupPositionProvider = position) {
        Text(
            text = text,
            color = MeeshyPalette.White,
            style = MaterialTheme.typography.labelMedium,
            modifier = Modifier
                .semantics { liveRegion = LiveRegionMode.Polite }
                .background(Color.Black.copy(alpha = MeeshyOpacity.heavy), CircleShape)
                .padding(horizontal = MeeshySpacing.sm, vertical = MeeshySpacing.xs),
        )
    }
}

/** Centrée au-dessus de l'avatar, ramenée dans la fenêtre (iOS: décalée de 34 pt vers le haut). */
private class AboveAnchor(private val gap: Int) : PopupPositionProvider {
    override fun calculatePosition(
        anchorBounds: IntRect,
        windowSize: IntSize,
        layoutDirection: LayoutDirection,
        popupContentSize: IntSize,
    ): IntOffset {
        val x = (anchorBounds.center.x - popupContentSize.width / 2)
            .coerceIn(0, maxOf(0, windowSize.width - popupContentSize.width))
        val y = (anchorBounds.top - popupContentSize.height - gap).coerceAtLeast(0)
        return IntOffset(x, y)
    }
}

@Composable
private fun lastSeenText(seen: PresenceLastSeen): String = when (seen) {
    PresenceLastSeen.Online -> stringResource(UiR.string.presence_online)
    is PresenceLastSeen.MinutesAgo -> pluralStringResource(UiR.plurals.presence_lastSeen_minutes, seen.value, seen.value)
    is PresenceLastSeen.HoursAgo -> pluralStringResource(UiR.plurals.presence_lastSeen_hours, seen.value, seen.value)
    is PresenceLastSeen.DaysAgo -> pluralStringResource(UiR.plurals.presence_lastSeen_days, seen.value, seen.value)
}
