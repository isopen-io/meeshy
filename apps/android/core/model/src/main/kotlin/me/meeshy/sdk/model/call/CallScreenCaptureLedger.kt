package me.meeshy.sdk.model.call

/**
 * R1.4 — qui capture l'écran de l'appel en ce moment, tenu PAR PERSONNE (miroir de iOS `CallCaptureLedger`) : en groupe, quand
 * l'un de deux enregistreurs s'arrête, la capsule reste pour l'autre, et le départ d'un enregistreur l'éteint — il n'enverra
 * jamais la fin de son enregistrement. Une capture d'écran ponctuelle (aucune fin sur le fil) passe devant, le temps de sa fenêtre.
 * Valeur immuable : chaque changement rend un nouveau registre.
 */
data class CallScreenCaptureLedger(
    /** Les enregistreurs d'écran, dans l'ordre où ils ont commencé ; le dernier est celui que la capsule nomme. */
    val recorders: List<String> = emptyList(),
    /** Celui dont la capture d'écran ponctuelle montre la capsule, jusqu'à la fin de sa fenêtre. */
    val screenshotBy: String? = null,
) {
    val isShown: Boolean get() = screenshotBy != null || recorders.isNotEmpty()

    /** Qui la capsule nomme : la capture ponctuelle d'abord, sinon le dernier enregistreur ; vide quand personne. */
    val capturerId: String get() = screenshotBy ?: recorders.lastOrNull().orEmpty()

    /**
     * Un début de capture entre au registre, la fin d'un ENREGISTREMENT en sort. La fin d'une capture ponctuelle, que la
     * passerelle relaie pour les clients d'avant, ne touche pas un enregistrement en cours.
     */
    fun applying(kind: CallCaptureKind, isCapturing: Boolean, capturerId: String): CallScreenCaptureLedger = when {
        kind == CallCaptureKind.RECORDING && isCapturing -> copy(recorders = recorders.filter { it != capturerId } + capturerId)
        kind == CallCaptureKind.RECORDING -> copy(recorders = recorders.filter { it != capturerId })
        kind == CallCaptureKind.SCREENSHOT && isCapturing -> copy(screenshotBy = capturerId)
        else -> this
    }

    /** La fenêtre de la capture ponctuelle est écoulée : la capsule revient à l'enregistreur, s'il y en a un. */
    fun screenshotCleared(): CallScreenCaptureLedger = copy(screenshotBy = null)

    /** Un participant parti n'enverra pas la fin de son enregistrement : son départ l'éteint. */
    fun participantLeft(userId: String): CallScreenCaptureLedger = copy(recorders = recorders.filter { it != userId })
}
