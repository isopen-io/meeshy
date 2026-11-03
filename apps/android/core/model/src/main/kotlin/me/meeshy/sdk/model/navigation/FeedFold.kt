package me.meeshy.sdk.model.navigation

/**
 * **Le Flux se replie quand la pile devient non vide, et revient au retour** (iOS `RootSheetsLayer`,
 * `feedWasVisibleBeforeNav`). Une loi pure : l'écran n'est que sa projection animée par le ressort
 * ([SPRING_RESPONSE_SECONDS], [SPRING_DAMPING_FRACTION]).
 *
 * - une pile qui devient non vide alors que le Flux est montré le replie ET se souvient qu'il l'était ;
 * - une pile qui redevient vide le remontre, une seule fois, si elle s'en souvient ;
 * - un Flux que l'utilisateur n'avait pas ouvert n'est jamais rouvert par un retour.
 */
public data class FeedFold(
    val feedShown: Boolean = false,
    val wasShownBeforeNavigation: Boolean = false,
) {
    public fun onStackChanged(stackIsEmpty: Boolean): FeedFold = when {
        !stackIsEmpty && feedShown -> FeedFold(feedShown = false, wasShownBeforeNavigation = true)
        stackIsEmpty && wasShownBeforeNavigation -> FeedFold(feedShown = true, wasShownBeforeNavigation = false)
        else -> this
    }

    /** L'accès rapide « Publier un post » montre le Flux : son composeur s'y ouvre. */
    public fun onFeedComposerRequested(): FeedFold = if (feedShown) this else copy(feedShown = true)

    public fun onFeedToggled(): FeedFold = FeedFold(feedShown = !feedShown, wasShownBeforeNavigation = false)

    public companion object {
        public const val SPRING_RESPONSE_SECONDS: Float = 0.3f
        public const val SPRING_DAMPING_FRACTION: Float = 0.8f
    }
}
