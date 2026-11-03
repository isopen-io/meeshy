package me.meeshy.sdk.model.chrome

/** Ce que chaque puits lit du meme total : le nombre d'icone obeit a la preference Badges, le reste non. */
public object BadgeCountPolicy {
    public fun iconCount(total: Int, badgesEnabled: Boolean): Int =
        if (badgesEnabled) total.coerceAtLeast(0) else 0

    public fun label(count: Int): String = unreadBadgeLabel(count)
}
