package me.meeshy.sdk.model

/** La teinte d'un état ACTIF du rail : cœur d'erreur, favori ambre, republier vert (iOS `ReelActionRail`). */
public enum class ReelRailTint { NONE, ERROR, WARNING, SUCCESS }

/** Ce que le rail affiche d'une action : son état posé, sa teinte et le compte à lire. */
public data class ReelRailCell(val isActive: Boolean, val tint: ReelRailTint, val count: Int)

/** Les quatre cellules à état du rail d'un réel, projetées d'un seul coup d'après les compteurs optimistes. */
public data class ReelActionRailState(
    val like: ReelRailCell,
    val comment: ReelRailCell,
    val bookmark: ReelRailCell,
    val repost: ReelRailCell,
) {
    public companion object {
        public fun of(
            isLiked: Boolean,
            likeCount: Int,
            commentCount: Int,
            isBookmarked: Boolean,
            bookmarkCount: Int,
            isReposted: Boolean,
            repostCount: Int,
        ): ReelActionRailState = ReelActionRailState(
            like = ReelRailCell(isLiked, if (isLiked) ReelRailTint.ERROR else ReelRailTint.NONE, likeCount),
            comment = ReelRailCell(false, ReelRailTint.NONE, commentCount),
            bookmark = ReelRailCell(isBookmarked, if (isBookmarked) ReelRailTint.WARNING else ReelRailTint.NONE, bookmarkCount),
            repost = ReelRailCell(isReposted, if (isReposted) ReelRailTint.SUCCESS else ReelRailTint.NONE, repostCount),
        )
    }
}
