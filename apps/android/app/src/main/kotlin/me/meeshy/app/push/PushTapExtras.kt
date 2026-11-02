package me.meeshy.app.push

import android.content.Intent
import me.meeshy.sdk.model.push.PushPayload

/**
 * Les clés `data` du push que le toucher d'une notification transmet à l'activité, pour que
 * [me.meeshy.sdk.model.push.PushTapDestination] choisisse la destination (conversation, post,
 * profil…) — app tuée comme ouverte. Les mêmes noms voyagent dans l'intent quand le système rend
 * lui-même la bannière : un seul lecteur ([read]) pour les deux chemins.
 */
object PushTapExtras {
    private val KEYS = listOf(
        "type", "conversationId", "messageId", "postId", "postType",
        "commentId", "parentCommentId", "senderId", "route",
    )

    fun put(intent: Intent, data: Map<String, String>) {
        KEYS.forEach { key -> data[key]?.takeIf { it.isNotBlank() }?.let { intent.putExtra(key, it) } }
    }

    fun read(intent: Intent): Pair<PushPayload, String?> {
        val present = KEYS.mapNotNull { key -> intent.getStringExtra(key)?.let { key to it } }.toMap()
        return PushPayload.decode(present) to present["route"]
    }
}
