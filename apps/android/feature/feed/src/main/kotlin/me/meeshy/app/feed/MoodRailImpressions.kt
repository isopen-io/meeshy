package me.meeshy.app.feed

/**
 * Le registre des humeurs déjà comptées par un rail monté (iOS `SharedImpressionBatchers.moodRail`, #13662) :
 * une humeur vue sur le rail compte UNE impression ; la faire défiler hors de l'écran puis la revoir pendant
 * que le rail reste monté n'en ajoute pas. Une nouvelle humeur du même ami est un autre identifiant : elle compte.
 */
class MoodRailImpressions {
    private val counted = HashSet<String>()

    /** Vrai la première fois que [statusId] est vu par ce rail — seul cas où l'impression part. */
    fun firstSight(statusId: String): Boolean = statusId.isNotBlank() && counted.add(statusId)
}
