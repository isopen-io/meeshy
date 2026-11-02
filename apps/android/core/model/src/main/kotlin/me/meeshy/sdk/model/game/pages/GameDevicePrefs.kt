package me.meeshy.sdk.model.game.pages

/**
 * LES RÉGLAGES DU JEU SUR L'APPAREIL (iOS `GameDevicePrefs`) — deux commodités, par appareil et par compte :
 * « Jeu masqué » (le jeu disparaît des écrans de cet appareil) et « Célébrations » (les cartes de Mee et Meo).
 * Aucune donnée de jeu ne vit ici ; une valeur illisible vaut le défaut : le jeu visible, les célébrations permises.
 * [friendsLeagueOptOut] est l'opposition telle que le serveur l'a CONFIRMÉE, redite à la réouverture.
 */
public data class GameDevicePrefs(
    val hidden: Boolean = false,
    val celebrations: Boolean = true,
    val friendsLeagueOptOut: Boolean = false,
) {
    /** Une proposition de photo ne s'offre que si le jeu est visible ET les célébrations permises. */
    public val offersPhotos: Boolean get() = !hidden && celebrations
}
