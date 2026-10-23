package me.meeshy.sdk.model.composer

/** Un lieu choisi mais pas encore envoyé — il voyage avec le plateau, pas comme un fichier. */
data class PendingPlace(
    val latitude: Double,
    val longitude: Double,
    val name: String? = null,
    val address: String? = null,
) {
    val isValid: Boolean
        get() = latitude in -90.0..90.0 && longitude in -180.0..180.0
}
