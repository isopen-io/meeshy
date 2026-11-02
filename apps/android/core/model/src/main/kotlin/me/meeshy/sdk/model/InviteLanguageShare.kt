package me.meeshy.sdk.model

/**
 * Une langue et sa part d'un ensemble (barre de proportions de la page d'invitation) —
 * miroir de `LanguageShare` (iOS). [isMeasured] = faux quand la source ne porte que la
 * LISTE des langues : la légende ne montre alors aucun pourcentage.
 */
data class InviteLanguageShare(
    val code: String,
    val fraction: Double,
    val isMeasured: Boolean,
) {
    val percent: Int get() = Math.round(fraction * 100).toInt()

    companion object {
        const val MAX_SEGMENTS = 6

        /** Parts mesurées, de la plus grande à la plus petite (ex æquo : code croissant). */
        fun weighted(counts: List<Pair<String, Int>>): List<InviteLanguageShare> {
            val kept = counts.filter { it.second > 0 }
            val total = kept.sumOf { it.second }
            if (total <= 0) return emptyList()
            return kept
                .sortedWith(compareByDescending<Pair<String, Int>> { it.second }.thenBy { it.first })
                .map { InviteLanguageShare(it.first, it.second.toDouble() / total, true) }
        }

        /** Parts égales d'une simple liste de langues (l'aperçu public ne sert aucun décompte). */
        fun even(codes: List<String>): List<InviteLanguageShare> {
            val unique = codes.distinct()
            if (unique.isEmpty()) return emptyList()
            val fraction = 1.0 / unique.size
            return unique.map { InviteLanguageShare(it, fraction, false) }
        }

        /** Au plus [MAX_SEGMENTS] segments : le reste est regroupé sous le code vide. */
        fun visible(shares: List<InviteLanguageShare>): List<InviteLanguageShare> {
            if (shares.size <= MAX_SEGMENTS) return shares
            val head = shares.take(MAX_SEGMENTS - 1)
            val rest = shares.drop(MAX_SEGMENTS - 1)
            return head + InviteLanguageShare("", rest.sumOf { it.fraction }, shares.all { it.isMeasured })
        }
    }
}

val ShareLinkInfo.spokenLanguageShares: List<InviteLanguageShare>
    get() = InviteLanguageShare.even(stats?.spokenLanguages.orEmpty())
