package me.meeshy.sdk.model.game.engagement

import me.meeshy.sdk.model.game.AchievementRarity
import me.meeshy.sdk.model.game.GamePhotoCatchUpLaw
import me.meeshy.sdk.model.game.GameRarityEntry

/**
 * Le moment que la révélation d'un palier propose en CARTE 9:16 (miroir de `PhotoMoment` + `GamePhotoMoments.ofReveal`,
 * iOS #7742, #20641) : une identité stable (jamais deux offres pour le même moment), son titre tel que la révélation
 * l'affiche, la rareté qu'on a le droit de montrer, et, pour une Flamme, ses jours ([flameDays], `null` pour un succès).
 */
public data class RevealPhotoMoment(
    val id: String,
    val title: String,
    val rarity: AchievementRarity?,
    val flameDays: Int? = null,
) {
    /** Le nom du fichier posé dans le cache partagé : un jeton sûr dérivé de l'identité, jamais du titre libre. */
    public val fileName: String get() = "meeshy-" + id.replace(Regex("[^A-Za-z0-9._-]"), "-") + ".png"
}

public object RevealPhotoOffer {
    /**
     * L'offre, ou `null`. Un SUCCÈS ou une FLAMME du carnet (7, 30, 100 jours), CÉLÉBRÉS, se photographient — ni
     * consultation, ni badge, niveau ou Flamme de 3, 14 ou 60 jours — et seulement si le jeu est visible et les
     * célébrations permises ([offersPhotos], « Jeu masqué » et « Célébrations » coupées la retirent). La Flamme porte
     * l'identité `flame:<jours>` du carnet et de Progression : la passerelle retient son push photo, c'est ici qu'elle
     * se propose.
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
            is EngagementReveal.Streak ->
                if (reveal.days in GamePhotoCatchUpLaw.flameThresholds) {
                    RevealPhotoMoment("flame:${reveal.days}", title, rarity = null, flameDays = reveal.days)
                } else {
                    null
                }
            is EngagementReveal.Badge, is EngagementReveal.Level -> null
        }
    }
}
