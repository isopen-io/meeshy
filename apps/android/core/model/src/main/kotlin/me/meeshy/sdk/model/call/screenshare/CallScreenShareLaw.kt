package me.meeshy.sdk.model.call.screenshare

/**
 * La projection d'écran vue du partage (#13332), indépendamment de la plateforme : la brique
 * Android (`MediaProjectionSession`) se projette sur ces cas avant d'interroger la loi.
 */
enum class ScreenShareCapture {
    /** Aucune capture pour le partage. */
    Idle,

    /** Le dialogue système ou le service de premier plan n'ont pas encore rendu la projection. */
    Pending,

    /** La projection est vivante : l'écran peut partir vers le pair. */
    Live,

    /** L'utilisateur a refusé le dialogue système. */
    Declined,

    /** La projection n'a pas pu s'obtenir (jeton consommé, service refusé). */
    Failed,

    /** La projection s'est arrêtée (bouton, notification, système, fin d'appel). */
    Over,
}

/** Ce que le partage fait d'un changement de la projection. */
enum class ScreenShareStep { Attach, Detach, Report, Acknowledge, None }

/** Ce que l'écran d'appel montre du partage local : le bouton, la bannière. */
enum class CallScreenSharePhase { Idle, Requesting, Sharing }

/**
 * La loi du partage d'écran d'un appel, miroir de `CallScreenShareController` d'iOS : la piste
 * d'écran part dès que la projection vit, se retire dès qu'elle cesse, quelle qu'en soit la cause ;
 * un échec se dit, un refus de l'utilisateur ne se reproche pas.
 */
object CallScreenShareLaw {

    fun step(isSharing: Boolean, capture: ScreenShareCapture): ScreenShareStep = when {
        capture == ScreenShareCapture.Live -> if (isSharing) ScreenShareStep.None else ScreenShareStep.Attach
        isSharing -> ScreenShareStep.Detach
        capture == ScreenShareCapture.Failed -> ScreenShareStep.Report
        capture == ScreenShareCapture.Declined -> ScreenShareStep.Acknowledge
        else -> ScreenShareStep.None
    }

    fun phase(isSharing: Boolean, capture: ScreenShareCapture): CallScreenSharePhase = when {
        isSharing -> CallScreenSharePhase.Sharing
        capture == ScreenShareCapture.Pending || capture == ScreenShareCapture.Live -> CallScreenSharePhase.Requesting
        else -> CallScreenSharePhase.Idle
    }

    /** Offert sur un appel établi ; un partage en cours garde toujours son bouton d'arrêt. */
    fun isOffered(isEstablished: Boolean, phase: CallScreenSharePhase): Boolean =
        isEstablished || phase != CallScreenSharePhase.Idle
}
