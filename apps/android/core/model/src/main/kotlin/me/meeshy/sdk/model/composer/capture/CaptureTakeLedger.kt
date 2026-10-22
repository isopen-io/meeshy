package me.meeshy.sdk.model.composer.capture

/**
 * Le registre des jetons de prise : un jeton par prise suit le fichier jusqu'à sa
 * livraison, et une prise PERDUE (caméra préemptée, fichier absent, session morte) se
 * signale au lieu de disparaître en silence (miroir de `capturedVideoId` /
 * `abandonedRecordingId` iOS). Immuable : chaque transition rend un nouveau registre.
 */
data class CaptureTakeLedger(
    val pending: Set<String> = emptySet(),
    val delivered: Set<String> = emptySet(),
    val lost: Set<String> = emptySet(),
) {
    /** Ouvre une prise. Un jeton déjà connu (en cours, livré ou perdu) n'est pas rouvert. */
    fun begin(token: String): CaptureTakeLedger =
        if (token in pending || token in delivered || token in lost) this else copy(pending = pending + token)

    /** La prise est arrivée à son hôte. Un jeton inconnu ou déjà soldé est ignoré. */
    fun deliver(token: String): CaptureTakeLedger =
        if (token !in pending) this else copy(pending = pending - token, delivered = delivered + token)

    /** La prise n'a produit aucun fichier : elle est signalée perdue. */
    fun abandon(token: String): CaptureTakeLedger =
        if (token !in pending) this else copy(pending = pending - token, lost = lost + token)

    /** Une nouvelle session ferme les prises encore ouvertes : elles sont perdues, jamais oubliées. */
    fun closeSession(): CaptureTakeLedger = copy(pending = emptySet(), lost = lost + pending)

    val hasLostTake: Boolean get() = lost.isNotEmpty()
}
