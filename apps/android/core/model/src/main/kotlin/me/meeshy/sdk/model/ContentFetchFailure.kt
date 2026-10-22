package me.meeshy.sdk.model

/**
 * Pourquoi un contenu n'a pas pu s'ouvrir (miroir de iOS `ContentFetchFailure`, #6508).
 * Quatre causes, car l'utilisateur n'a pas la meme chose a faire devant chacune :
 * [NETWORK] la requete n'est pas arrivee ; [SERVER] le serveur a repondu et a echoue
 * (jamais « verifiez votre connexion ») ; [FORBIDDEN] / [NOT_FOUND] le serveur a dit non :
 * reessayer echouerait a l'identique.
 */
enum class ContentFetchFailure {
    NETWORK,
    SERVER,
    FORBIDDEN,
    NOT_FOUND,
    ;

    /** Le serveur a repondu non : il n'y a rien a reessayer. */
    val isAbsence: Boolean get() = this == FORBIDDEN || this == NOT_FOUND

    /** Reessayer n'est propose que la ou reessayer peut aboutir. */
    val offersRetry: Boolean get() = !isAbsence

    companion object {
        fun fromHttpStatus(status: Int): ContentFetchFailure = when (status) {
            403 -> FORBIDDEN
            404, 410 -> NOT_FOUND
            else -> SERVER
        }
    }
}
