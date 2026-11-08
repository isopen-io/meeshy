package me.meeshy.sdk.model.profile

import me.meeshy.sdk.model.UserStats

/**
 * Les compteurs du bandeau de l'onglet Postes (miroir de `ProfilePostsCounts` iOS) : totaux exacts du
 * serveur quand ils existent, sinon dérivés des publications chargées — donc des bornes basses
 * ([isApproximate], affichées « N+ ») tant qu'il reste des pages.
 */
data class ProfilePostsCounts(
    val posts: Int,
    val reels: Int,
    val stories: Int,
    val isApproximate: Boolean,
) {
    /** Les totaux serveur remplacent le dérivé champ par champ ; aucun total servi = le dérivé tel quel. */
    fun merging(stats: UserStats?): ProfilePostsCounts {
        if (stats == null || (stats.postsCount == null && stats.reelsCount == null && stats.storiesCount == null)) return this
        return ProfilePostsCounts(
            posts = stats.postsCount ?: posts,
            reels = stats.reelsCount ?: reels,
            stories = stats.storiesCount ?: stories,
            isApproximate = false,
        )
    }

    companion object {
        val EMPTY: ProfilePostsCounts = ProfilePostsCounts(0, 0, 0, isApproximate = true)

        fun derived(kinds: List<ProfilePostKind>, hasMore: Boolean): ProfilePostsCounts = ProfilePostsCounts(
            posts = kinds.count { it == ProfilePostKind.POST },
            reels = kinds.count { it == ProfilePostKind.REEL },
            stories = kinds.count { it == ProfilePostKind.STORY },
            isApproximate = hasMore,
        )

        /** « N+ » pour une borne basse strictement positive, « N » sinon. */
        fun displayValue(value: Int, isApproximate: Boolean): String =
            if (isApproximate && value > 0) "$value+" else "$value"
    }
}
