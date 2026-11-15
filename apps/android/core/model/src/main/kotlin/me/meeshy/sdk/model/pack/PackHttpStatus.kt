package me.meeshy.sdk.model.pack

/**
 * Ce qu'un statut HTTP et un code de passerelle disent d'un geste de boutique — miroir de `PackHTTPStatus` d'iOS
 * (`PackShopModels.swift`). Une seule lecture : le registre des achats, le dépôt et les écrans la partagent.
 */
object PackHttpStatus {
    const val FORBIDDEN: Int = 403
    const val NOT_FOUND: Int = 404
    const val INSUFFICIENT_MEESHES: String = "INSUFFICIENT_MEESHES"

    /** Le code que la couche réseau pose sur une panne de transport (aucune réponse du serveur). */
    const val NETWORK_CODE: String = "NETWORK"

    /**
     * Un refus DÉFINITIF (le geste est tranché) : 4xx hors 408/429. Un réseau coupé ou un 5xx laisse le geste rejouable
     * avec le même identifiant d'intention.
     */
    fun isDefinitiveRefusal(httpStatus: Int?): Boolean =
        httpStatus != null && httpStatus in 400..499 && httpStatus != 408 && httpStatus != 429

    /** `INSUFFICIENT_MEESHES` : le solde ne couvre pas le prix, sans effet côté serveur. */
    fun isInsufficientMeeshes(code: String?): Boolean = code == INSUFFICIENT_MEESHES

    /** `403` : la possession ou les droits ont changé ailleurs, la vitrine affichée n'est plus la vérité du serveur. */
    fun isForbidden(httpStatus: Int?): Boolean = httpStatus == FORBIDDEN

    /** Aucune réponse du serveur : le transport a échoué (hors ligne, délai, coupure). */
    fun isOffline(httpStatus: Int?, code: String?): Boolean = httpStatus == null && code == NETWORK_CODE
}
