package me.meeshy.app.conversations

import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import me.meeshy.sdk.model.PresenceState
import me.meeshy.sdk.model.avatar.AvatarContext
import me.meeshy.sdk.model.avatar.ConversationHere
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.component.StoryRingState
import me.meeshy.ui.theme.LentilleMetrics

/**
 * L'avatar de 44 dp (contexte `ConversationHeaderCollapsed`) entouré de l'anneau d'accent de la
 * conversation (1,5 dp à 55 %). La présence arrive déjà résolue: la frappe l'a forcée au vert, et un
 * pair hors ligne n'a aucun point (la règle vit dans l'atome, pas ici).
 */
@Composable
internal fun ConversationRowAvatar(
    name: String,
    accent: Color,
    secondary: Color,
    presence: PresenceState?,
    storyRing: StoryRingState,
    moodEmoji: String?,
    here: ConversationHere,
    modifier: Modifier = Modifier,
    imageUrl: String? = null,
) {
    val ring = LentilleMetrics.Avatar.ringWidth
    Box(
        modifier = modifier
            .size(LentilleMetrics.Avatar.size + ring * 2)
            .border(ring, accent.copy(alpha = LentilleMetrics.Avatar.ringOpacity), CircleShape),
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
            imageUrl = imageUrl,
        )
    }
}
