package me.meeshy.sdk.model.auth

/** Ce qu'une preuve par lien a rendu, et qui attend d'être adopté (#10518). */
enum class ProvenAdoptionKind { SESSION, SECOND_FACTOR }

/**
 * Le délai d'adoption d'une preuve par lien, côté appareil — miroir de
 * `packages/shared/utils/proven-session-adoption.ts` et de `ProvenAdoptionWindow.swift`.
 *
 * La passerelle sert `adoptWithinSeconds` : une DURÉE, appliquée à l'instant où l'appareil
 * a reçu la preuve, sans comparer son horloge à celle du serveur. Elle ne sert qu'à ne pas
 * ranger le compte ouvert pour poser une session que la passerelle refuserait : une fenêtre
 * lue trop longue ne prolonge aucune session, la passerelle seule adopte.
 */
object ProvenAdoptionWindow {

    /** Ce que l'appareil retranche du délai servi : le trajet de la réponse, puis celui du premier appel. */
    const val CLIENT_MARGIN_MS: Long = 60_000L

    /** Borne DURE : quoi que la réponse prétende, une preuve gardée en mémoire finit par expirer. */
    const val CLIENT_MAX_MS: Long = 30 * 60_000L

    /** Le plus grand entier que le contrat partagé tient pour lisible (`Number.isSafeInteger`). */
    const val MAX_READABLE_SECONDS: Long = 9_007_199_254_740_991L

    /** La fenêtre quand la passerelle ne sert rien de lisible : toujours PLUS COURTE que la sienne. */
    fun fallbackMs(kind: ProvenAdoptionKind): Long = when (kind) {
        ProvenAdoptionKind.SESSION -> 9 * 60_000L
        ProvenAdoptionKind.SECOND_FACTOR -> 4 * 60_000L
    }

    /**
     * La fenêtre appliquée à l'instant de réception. Un délai absent, négatif ou au-delà de
     * [MAX_READABLE_SECONDS] vaut le repli ; un délai lisible est suivi, moins la marge, jusqu'à
     * la borne dure. Zéro ferme la fenêtre.
     */
    fun clientWindowMs(kind: ProvenAdoptionKind, adoptWithinSeconds: Long?): Long {
        val served = adoptWithinSeconds?.takeIf { it in 0..MAX_READABLE_SECONDS } ?: return fallbackMs(kind)
        return bounded(served * 1000 - CLIENT_MARGIN_MS)
    }

    /** Une fenêtre ramenée entre zéro et la borne dure. */
    fun bounded(windowMs: Long): Long = windowMs.coerceIn(0L, CLIENT_MAX_MS)

    /**
     * La preuve a-t-elle passé la fenêtre où l'adopter vaut encore ? Dans le doute, oui : une
     * fenêtre nulle est fermée, et une horloge revenue en arrière ne rouvre rien.
     */
    fun hasLapsed(receivedAtMs: Long, windowMs: Long, nowMs: Long): Boolean {
        val elapsed = nowMs - receivedAtMs
        if (windowMs <= 0 || elapsed < 0) return true
        return elapsed > bounded(windowMs)
    }
}
