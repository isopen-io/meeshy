package me.meeshy.app.conversations

import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import me.meeshy.sdk.model.avatar.AvatarContext
import me.meeshy.sdk.model.avatar.ConversationHere
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.component.StoryRingState
import me.meeshy.ui.component.rememberPresence
import me.meeshy.ui.theme.LentilleMetrics

/**
 * L'avatar de 44 dp (contexte `ConversationHeaderCollapsed`) entouré de l'anneau d'accent de la
 * conversation (1,5 dp à 55 %). La présence du pair ([peerUserId], `null` pour un groupe) se lit ICI, à la
 * cellule, sur le tick partagé de 15 s (`rememberPresence`): seul cet avatar se recompose quand le point change
 * de couleur, jamais la liste. La frappe la force au vert ([isTyping]), un pair hors ligne n'a aucun point
 * (la règle vit dans l'atome). Le point d'une rangée directe se touche: « vu il y a X » deux secondes.
 */
@Composable
internal fun ConversationRowAvatar(
    name: String,
    accent: Color,
    secondary: Color,
    peerUserId: String?,
    isTyping: Boolean,
    storyRing: StoryRingState,
    moodEmoji: String?,
    here: ConversationHere,
    modifier: Modifier = Modifier,
    imageUrl: String? = null,
) {
    val presence = ConversationRowPrecedence.presence(rememberPresence(peerUserId), isTyping)
    val lastSeen = rememberLastSeenTip(peerUserId)
    val ring = LentilleMetrics.Avatar.ringWidth
    val touchable = peerUserId != null && ConversationRowLastSeen.dotIsTouchable(presence, here, moodEmoji)
    Box(
        modifier = modifier
            .size(LentilleMetrics.Avatar.size + ring * 2)
            .border(ring, accent.copy(alpha = LentilleMetrics.Avatar.ringOpacity), CircleShape)
            .then(if (touchable) Modifier.lastSeenAccessibilityAction(lastSeen) else Modifier),
        contentAlignment = Alignment.Center,
    ) {
        MeeshyAvatar(
            name = name,
            context = AvatarContext.ConversationHeaderCollapsed,
            containerColor = accent,
            secondaryColor = secondary,
            storyRing = storyRing,
            presence = presence,
            moodEmoji = moodEmoji,
            here = here,
            enablePulse = false,
            onDotTap = if (touchable) lastSeen::show else null,
            imageUrl = imageUrl,
        )
        LastSeenTooltip(lastSeen.tip)
    }
}
