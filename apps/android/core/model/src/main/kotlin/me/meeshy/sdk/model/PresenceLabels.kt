package me.meeshy.sdk.model

/** Le libellé d'un état de présence ; le texte localisé se résout côté UI (miroir de `localizedLabel`). */
public enum class PresenceLabel { ONLINE, AWAY, IDLE, OFFLINE, HERE }

/** « Vu il y a … » : moins de 60 s se lit « En ligne » (miroir de `MeeshyConversation.lastSeenLabel`). */
public sealed interface PresenceLastSeen {
    public data object Online : PresenceLastSeen
    public data class MinutesAgo(val value: Int) : PresenceLastSeen
    public data class HoursAgo(val value: Int) : PresenceLastSeen
    public data class DaysAgo(val value: Int) : PresenceLastSeen
}

public object PresenceLabels {
    private const val MINUTE_SECONDS: Long = 60L
    private const val HOUR_SECONDS: Long = 3_600L
    private const val DAY_SECONDS: Long = 86_400L

    public fun label(state: PresenceState): PresenceLabel = when (state) {
        PresenceState.ONLINE -> PresenceLabel.ONLINE
        PresenceState.AWAY -> PresenceLabel.AWAY
        PresenceState.IDLE -> PresenceLabel.IDLE
        PresenceState.OFFLINE -> PresenceLabel.OFFLINE
    }

    public fun lastSeen(elapsedSeconds: Long): PresenceLastSeen = when {
        elapsedSeconds < MINUTE_SECONDS -> PresenceLastSeen.Online
        elapsedSeconds < HOUR_SECONDS -> PresenceLastSeen.MinutesAgo((elapsedSeconds / MINUTE_SECONDS).toInt())
        elapsedSeconds < DAY_SECONDS -> PresenceLastSeen.HoursAgo((elapsedSeconds / HOUR_SECONDS).toInt())
        else -> PresenceLastSeen.DaysAgo((elapsedSeconds / DAY_SECONDS).toInt())
    }

    public fun lastSeen(lastSeenAtEpochMillis: Long, nowEpochMillis: Long): PresenceLastSeen =
        lastSeen((nowEpochMillis - lastSeenAtEpochMillis) / 1_000L)
}
