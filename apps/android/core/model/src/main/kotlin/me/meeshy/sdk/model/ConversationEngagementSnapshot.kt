package me.meeshy.sdk.model

import kotlinx.serialization.Serializable

/**
 * « N (M) 🔥 » — ce qu'une conversation a rapporté à son LECTEUR (#8906, miroir de
 * `ConversationEngagementSnapshot` iOS). Servi tel quel par la passerelle : `viewerEngagement` sur
 * chaque ligne de `GET /conversations`, `GET /conversations/{id}/engagement`, et l'événement
 * `engagement:conversation-updated` (room personnelle du crédité) — rien n'est calculé côté client,
 * hormis la relecture au jour civil du lecteur ([forDay]).
 */
@Serializable
data class ConversationEngagementSnapshot(
    override val conversationId: String,
    /** N — points rapportés par cette conversation, depuis toujours. */
    val totalPoints: Int = 0,
    /** M — points rapportés aujourd'hui (jour [day]). */
    val todayPoints: Int = 0,
    /** Jours civils consécutifs avec au moins un geste crédité ici. */
    val streakDays: Int = 0,
    /** Jour civil (`AAAA-MM-JJ`, fuseau du lecteur) du dernier geste crédité ; `null` si jamais. */
    val day: String? = null,
) : SingleConversationSocketEvent {

    /**
     * Ce qu'on AFFICHE le jour [today] : les points du jour retombent à 0 dès que [day] n'est plus
     * [today] ; la série tombe à 0 quand le dernier geste date d'avant-hier ou plus (hier, elle tient).
     */
    fun forDay(today: String): ConversationEngagementSnapshot {
        val last = day?.let(::dayNumber)
        val current = dayNumber(today)
        if (last == null || current == null) return copy(todayPoints = 0, streakDays = 0)
        val gap = current - last
        return copy(
            todayPoints = if (gap == 0L) todayPoints else 0,
            streakDays = if (gap <= 1L) streakDays else 0,
        )
    }

    /**
     * Deux instantanés d'une même conversation arrivent par deux chemins (REST, socket) sans ordre
     * garanti : le plus récent est celui du jour le plus tardif, puis, le même jour, celui qui a cumulé
     * le plus de points — un cache relu après un événement temps réel ne le fait pas reculer.
     */
    fun isFresherThan(other: ConversationEngagementSnapshot): Boolean {
        val mine = day.orEmpty()
        val theirs = other.day.orEmpty()
        if (mine != theirs) return mine > theirs
        return totalPoints > other.totalPoints
    }

    /** Une série court : la flamme a quelque chose à dire. */
    val hasRunningStreak: Boolean get() = streakDays > 0

    companion object {
        /** Le jour civil `AAAA-MM-JJ` de [date] dans le calendrier du lecteur. */
        fun dayString(date: java.time.LocalDate): String = date.toString()

        /** Jours depuis le 1970-01-01 d'un `AAAA-MM-JJ` (grégorien proleptique, sans fuseau) ; `null` si mal formé. */
        internal fun dayNumber(value: String): Long? {
            val fields = value.split('-')
            if (fields.size != 3 || fields[0].length != 4 || fields[1].length != 2 || fields[2].length != 2) return null
            if (!fields.all { part -> part.all { it in '0'..'9' } }) return null
            val year = fields[0].toInt()
            val month = fields[1].toInt()
            val dayOfMonth = fields[2].toInt()
            if (month !in 1..12 || dayOfMonth !in 1..31) return null
            return java.time.LocalDate.of(year, month, 1).plusDays((dayOfMonth - 1).toLong()).toEpochDay()
        }
    }

    private fun dayNumber(value: String): Long? = Companion.dayNumber(value)
}
