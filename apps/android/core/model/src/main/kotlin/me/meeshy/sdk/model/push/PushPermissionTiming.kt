package me.meeshy.sdk.model.push

import me.meeshy.sdk.model.auth.SessionOrigin

/** Ce qui peut déclencher la demande de permission de notification. */
public sealed interface PushPermissionTrigger {
    /** Une session s'ouvre (connexion, inscription, restauration au démarrage à froid). */
    public data class SessionOpened(val origin: SessionOrigin?) : PushPermissionTrigger

    /** Un premier message envoyé vient d'être accepté par le serveur. */
    public data object FirstMessageAccepted : PushPermissionTrigger
}

public enum class PushPermissionDecision {
    /** Montrer la boîte système maintenant. */
    ASK_NOW,

    /** Garder (ou reposer) le marqueur : la demande est due plus tard. */
    POSTPONE,

    /** Ne rien faire. */
    NOTHING,
}

/**
 * Quand demander `POST_NOTIFICATIONS`, miroir de `PushPermissionPrompt` (iOS).
 *
 * Une inscription reporte la demande au premier message accepté : l'alerte tomberait sinon
 * sur un compte vide, et un refus (Android ne repropose plus après deux) se paie sur chaque
 * message reçu. Une connexion ou une restauration demande à l'ouverture, sauf si l'onboarding
 * garde la fenêtre pour sa carte Langues.
 */
public object PushPermissionTiming {
    private const val RUNTIME_PERMISSION_SDK = 33

    /**
     * @param markerPending un report posé à l'inscription attend encore son premier message.
     * @param onboardingHoldsWindow l'onboarding garde la fenêtre pour sa propre carte.
     */
    public fun decide(
        trigger: PushPermissionTrigger,
        markerPending: Boolean,
        onboardingHoldsWindow: Boolean,
        sdkInt: Int,
    ): PushPermissionDecision {
        if (sdkInt < RUNTIME_PERMISSION_SDK) return PushPermissionDecision.NOTHING
        return when (trigger) {
            is PushPermissionTrigger.SessionOpened -> when {
                trigger.origin == SessionOrigin.REGISTRATION -> PushPermissionDecision.POSTPONE
                markerPending -> PushPermissionDecision.NOTHING
                onboardingHoldsWindow -> PushPermissionDecision.POSTPONE
                else -> PushPermissionDecision.ASK_NOW
            }
            PushPermissionTrigger.FirstMessageAccepted -> when {
                !markerPending -> PushPermissionDecision.NOTHING
                onboardingHoldsWindow -> PushPermissionDecision.POSTPONE
                else -> PushPermissionDecision.ASK_NOW
            }
        }
    }
}
