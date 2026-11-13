package me.meeshy.sdk.model

/**
 * Pourquoi le détail d'une communauté n'a pas pu s'ouvrir — la cause que l'écran DIT
 * (miroir de iOS `CommunityLoadFailure`, #7816, #17104). Jamais le message brut du serveur.
 *
 * [REFUSED] : 403 et 404 rendus pareils, un identifiant ne dit pas si une communauté privée
 * existe ; réessayer échouerait à l'identique, on n'offre que le retour. [NETWORK] : vérifier
 * sa connexion, réessayer. [SERVER] : réessayer, sans parler de connexion.
 */
enum class CommunityLoadFailure {
    REFUSED,
    NETWORK,
    SERVER,
    ;

    val offersRetry: Boolean get() = this != REFUSED

    companion object {
        fun of(cause: ContentFetchFailure): CommunityLoadFailure = when (cause) {
            ContentFetchFailure.FORBIDDEN, ContentFetchFailure.NOT_FOUND -> REFUSED
            ContentFetchFailure.NETWORK -> NETWORK
            ContentFetchFailure.SERVER -> SERVER
        }
    }
}
