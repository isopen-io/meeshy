package me.meeshy.sdk.model.playback

/** Un rectangle en pixels du canevas carré de la carte de lecture. */
public data class ArtworkRect(val left: Int, val top: Int, val size: Int)

/** D'où vient l'image de fond de la carte : l'avatar de l'auteur, celui de la conversation, ou l'icône de l'app. */
public sealed interface NowPlayingArtworkSource {
    public data class Avatar(val url: String) : NowPlayingArtworkSource
    public data object AppIcon : NowPlayingArtworkSource
}

/**
 * **L'image carrée de la carte de lecture** (écran verrouillé, notification, casque) — miroir de iOS
 * `NowPlayingArtwork` : avatar de l'AUTEUR > avatar de la CONVERSATION > icône de l'app, et quand un
 * avatar existe, l'icône de l'app est apposée en badge en bas à gauche pour que la carte reste
 * identifiable. Pure : le dessin vit dans `NowPlayingArtworkRenderer`.
 */
public object NowPlayingArtworkPlan {

    /** Côté du canevas carré rendu. */
    public const val CANVAS_SIDE: Int = 600

    /** Fraction du côté occupée par le badge. */
    public const val BADGE_FRACTION: Double = 0.26

    /** Marge du badge depuis les bords, en fraction du côté. */
    public const val BADGE_PADDING_FRACTION: Double = 0.04

    /** Rayon des coins du badge, en fraction de son côté. */
    public const val BADGE_CORNER_FRACTION: Double = 0.22

    /** Première URL d'avatar exploitable : auteur puis conversation ; `null` ⇒ l'icône de l'app. */
    public fun preferredAvatarUrl(senderAvatarUrl: String?, conversationArtworkUrl: String?): String? =
        senderAvatarUrl?.takeIf { it.isNotBlank() } ?: conversationArtworkUrl?.takeIf { it.isNotBlank() }

    public fun source(senderAvatarUrl: String?, conversationArtworkUrl: String?): NowPlayingArtworkSource =
        preferredAvatarUrl(senderAvatarUrl, conversationArtworkUrl)
            ?.let(NowPlayingArtworkSource::Avatar)
            ?: NowPlayingArtworkSource.AppIcon

    /** Le badge en bas à gauche ; `null` quand il n'y a pas d'avatar (l'icône occupe alors tout le cadre). */
    public fun badgeRect(hasAvatar: Boolean, side: Int = CANVAS_SIDE): ArtworkRect? {
        if (!hasAvatar) return null
        val badge = Math.round(side * BADGE_FRACTION).toInt()
        val padding = Math.round(side * BADGE_PADDING_FRACTION).toInt()
        return ArtworkRect(left = padding, top = side - padding - badge, size = badge)
    }

    public fun badgeCornerRadius(badgeSize: Int): Float = (badgeSize * BADGE_CORNER_FRACTION).toFloat()
}
