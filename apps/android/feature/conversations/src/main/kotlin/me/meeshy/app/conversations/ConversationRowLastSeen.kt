package me.meeshy.app.conversations

import me.meeshy.sdk.model.PresenceLabels
import me.meeshy.sdk.model.PresenceLastSeen
import me.meeshy.sdk.model.PresenceState
import me.meeshy.sdk.model.UserPresence
import me.meeshy.sdk.model.avatar.AvatarPresenceDot
import me.meeshy.sdk.model.avatar.ConversationHere
import me.meeshy.sdk.model.isoToEpochMillisOrNull

/**
 * « Vu il y a X » au toucher du point d'une rangée directe (iOS `ThemedConversationRow` `onOnlineTap`,
 * libellé `MeeshyConversation.lastSeenLabel`). Les deux décisions sont pures: ce que le point dit, et quand
 * il se touche.
 */
internal object ConversationRowLastSeen {

    /** Deux secondes, puis le libellé s'efface (iOS `asyncAfter(.now() + 2)`). */
    const val VISIBLE_MILLIS: Long = 2_000L

    /** La dernière activité du pair; `null` quand la carte n'en porte aucune: l'absence de donnée ne se rend pas. */
    fun of(entry: UserPresence?, nowMillis: Long): PresenceLastSeen? {
        val lastActive = isoToEpochMillisOrNull(entry?.lastActiveAt) ?: return null
        return PresenceLabels.lastSeen(lastActive, nowMillis)
    }

    /** Le point se touche s'il se dessine: une humeur le masque, hors ligne ou sans donnée il n'existe pas. */
    fun dotIsTouchable(presence: PresenceState?, here: ConversationHere, moodEmoji: String?): Boolean =
        moodEmoji.isNullOrEmpty() && AvatarPresenceDot.resolve(presence, isHere = here.isHere) != null
}
