package me.meeshy.sdk.model.game.engagement

import me.meeshy.sdk.model.game.AchievementRarity
import me.meeshy.sdk.model.game.GameRarityEntry

/**
 * Le moment que la révélation d'un succès propose en CARTE 9:16 (miroir de `PhotoMoment` + `GamePhotoMoments.achievement`,
 * iOS #7742) : une identité stable (le succès — jamais deux offres pour le même), son titre tel que la révélation
 * l'affiche, et la rareté qu'on a le droit de montrer.
 */
public data class RevealPhotoMoment(val id: String, val title: String, val rarity: AchievementRarity?) {
    /** Le nom du fichier posé dans le cache partagé : un jeton sûr dérivé de l'identité, jamais du titre libre. */
    public val fileName: String get() = "meeshy-" + id.replace(Regex("[^A-Za-z0-9._-]"), "-") + ".png"
}

public object RevealPhotoOffer {
    /**
     * L'offre, ou `null`. Seul un SUCCÈS CÉLÉBRÉ se photographie (ni consultation, ni badge, série ou niveau), et seulement
     * si le jeu est visible et les célébrations permises ([offersPhotos], « Jeu masqué » et « Célébrations » coupées la retirent).
     */
    public fun of(
        reveal: EngagementReveal,
        occasion: RevealOccasion,
        offersPhotos: Boolean,
        title: String,
        entry: GameRarityEntry?,
    ): RevealPhotoMoment? {
        if (!offersPhotos || !occasion.isCelebration) return null
        return when (reveal) {
            is EngagementReveal.Achievement, is EngagementReveal.ComposedAchievement ->
                RevealPhotoMoment(reveal.id, title, entry?.visibleRarity)
            is EngagementReveal.Badge, is EngagementReveal.Streak, is EngagementReveal.Level -> null
        }
    }
}
