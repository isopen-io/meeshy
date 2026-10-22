package me.meeshy.app.widget.kit

import me.meeshy.sdk.model.PresenceState

/** Clé de cache d'un avatar : tout ce qui change le rendu, rien d'autre. */
internal data class WidgetAvatarKey(
    val initials: String,
    val accentHex: String,
    val sizeDp: Int,
    val presence: String,
) {
    companion object {
        fun of(name: String, accentHex: String, sizeDp: Int, presence: String?): WidgetAvatarKey =
            WidgetAvatarKey(
                initials = WidgetInitials.of(name),
                accentHex = accentHex.trim().removePrefix("#").uppercase(),
                sizeDp = sizeDp,
                presence = WidgetPresence.parse(presence)?.token ?: WidgetPresence.OFFLINE_TOKEN,
            )
    }
}

/** Cache LRU borné (le processus d'un widget est court et la mémoire comptée). */
internal class WidgetAvatarCache<V : Any>(private val capacity: Int) {
    private val map = object : LinkedHashMap<WidgetAvatarKey, V>(capacity, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<WidgetAvatarKey, V>?): Boolean =
            size > capacity
    }

    val size: Int @Synchronized get() = map.size

    @Synchronized
    fun peek(key: WidgetAvatarKey): V? = map[key]

    @Synchronized
    fun getOrPut(key: WidgetAvatarKey, create: () -> V): V =
        map[key] ?: create().also { map[key] = it }
}

/** Jetons de présence publiés (`PresenceState.rawValue` côté iOS) → état. */
internal object WidgetPresence {
    const val OFFLINE_TOKEN = "offline"

    class Parsed(val state: PresenceState, val token: String)

    fun parse(token: String?): Parsed? = when (token?.lowercase()) {
        "online" -> Parsed(PresenceState.ONLINE, "online")
        "away" -> Parsed(PresenceState.AWAY, "away")
        "idle" -> Parsed(PresenceState.IDLE, "idle")
        "offline" -> Parsed(PresenceState.OFFLINE, OFFLINE_TOKEN)
        else -> null
    }
}
