package me.meeshy.sdk.model.media

/** Pourquoi un bail d'envoi s'est terminé : une seule issue est retenue, la première. */
enum class UploadLeaseEnd { SUCCEEDED, FAILED, CANCELLED, EXPIRED }

/**
 * Le bail d'un envoi lourd (miroir de `BackgroundTaskLease`, iOS) : pris AVANT que le travail démarre, terminé
 * EXACTEMENT UNE FOIS quel que soit le chemin — succès, échec, annulation de l'utilisateur ou expiration système
 * (timeout `dataSync`). Une seconde fin est ignorée : la notification n'est jamais retirée deux fois ni laissée
 * orpheline. Valeur immuable, sans horloge ni Android.
 */
data class UploadLeasePlan private constructor(
    val held: Boolean,
    val ended: UploadLeaseEnd?,
) {
    /** Ce qu'une fin a décidé : le nouveau plan et si CETTE fin est celle qui doit relâcher le bail. */
    data class Transition(val plan: UploadLeasePlan, val releases: Boolean)

    val expired: Boolean get() = ended == UploadLeaseEnd.EXPIRED

    fun begin(): UploadLeasePlan = if (held || ended != null) this else copy(held = true)

    fun end(reason: UploadLeaseEnd): Transition = when {
        ended != null -> Transition(this, releases = false)
        !held -> Transition(copy(ended = reason), releases = false)
        else -> Transition(copy(held = false, ended = reason), releases = true)
    }

    companion object {
        fun idle(): UploadLeasePlan = UploadLeasePlan(held = false, ended = null)
    }
}
