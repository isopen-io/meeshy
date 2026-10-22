package me.meeshy.sdk.model

import me.meeshy.sdk.model.media.MediaPermissionState

/** Étendue d'un accès : entier, partiel (sélection de photos, API 34) ou aucun. */
enum class PermissionGrant { NONE, PARTIAL, FULL }

/**
 * Les faits bruts que la plateforme sait dire sur une [PermissionNature], rassemblés par
 * l'adaptateur Android. Tout ce qui s'en déduit (étendue, état, décision) se calcule ici,
 * en Kotlin pur, et se prouve sans appareil.
 */
data class PermissionFacts(
    val grantedPermissions: Set<String>,
    val rationalePermissions: Set<String>,
    val requestedPermissions: Set<String>,
    val appNotificationsEnabled: Boolean = true,
    val blockedByPolicy: Boolean = false,
)

/**
 * Photographie d'un accès à un instant donné.
 *
 * `shouldShowRequestPermissionRationale` rend `false` AVANT la première demande comme APRÈS
 * un refus définitif : sans la mémoire des demandes ([everRequested]), on ne peut pas dire
 * si la boîte système va encore s'afficher. C'est ce que l'historique persistant apporte.
 */
data class PermissionSnapshot(
    val grant: PermissionGrant,
    val promptable: Boolean,
    val everRequested: Boolean,
    val rationaleSuggested: Boolean,
    val blockedByPolicy: Boolean = false,
) {
    val state: MediaPermissionState
        get() = when {
            blockedByPolicy -> MediaPermissionState.RESTRICTED
            grant == PermissionGrant.FULL -> MediaPermissionState.GRANTED
            grant == PermissionGrant.PARTIAL -> MediaPermissionState.LIMITED
            !promptable -> MediaPermissionState.DENIED
            rationaleSuggested -> MediaPermissionState.NOT_DETERMINED
            everRequested -> MediaPermissionState.DENIED
            else -> MediaPermissionState.NOT_DETERMINED
        }
}

/** Pourquoi on explique avant de demander : première demande, ou après un refus simple. */
enum class PermissionExplainReason { FIRST_REQUEST, AFTER_REFUSAL }

/** Ce que la porte unique fait d'une demande d'accès. */
sealed interface PermissionStep {
    /** Accordé : on procède sans rien afficher. */
    data object Proceed : PermissionStep

    /** On explique le besoin, puis seulement on affiche la boîte système. */
    data class ExplainThenRequest(val reason: PermissionExplainReason) : PermissionStep

    /** Refus définitif : plus de boîte système, on renvoie vers les Réglages de l'app. */
    data object SendToSettings : PermissionStep
}

object PermissionRequestPlan {

    fun snapshot(nature: PermissionNature, sdkInt: Int, facts: PermissionFacts): PermissionSnapshot {
        val requirements = nature.requirements(sdkInt)
        return PermissionSnapshot(
            grant = grantOf(requirements, facts),
            promptable = requirements.hasSystemPrompt,
            everRequested = requirements.request.any { it in facts.requestedPermissions },
            rationaleSuggested = requirements.request.any { it in facts.rationalePermissions },
            blockedByPolicy = facts.blockedByPolicy,
        )
    }

    fun decide(snapshot: PermissionSnapshot): PermissionStep {
        val state = snapshot.state
        return when {
            state.isUsable -> PermissionStep.Proceed
            state.canPrompt -> PermissionStep.ExplainThenRequest(explainReason(snapshot))
            else -> PermissionStep.SendToSettings
        }
    }

    private fun explainReason(snapshot: PermissionSnapshot): PermissionExplainReason =
        if (snapshot.rationaleSuggested || snapshot.everRequested) {
            PermissionExplainReason.AFTER_REFUSAL
        } else {
            PermissionExplainReason.FIRST_REQUEST
        }

    private fun grantOf(requirements: PermissionRequirements, facts: PermissionFacts): PermissionGrant = when {
        !requirements.hasSystemPrompt -> noPromptGrant(requirements.whenNoPrompt, facts)
        requirements.fullAccess.any { it in facts.grantedPermissions } -> PermissionGrant.FULL
        requirements.partialAccess.any { it in facts.grantedPermissions } -> PermissionGrant.PARTIAL
        else -> PermissionGrant.NONE
    }

    private fun noPromptGrant(whenNoPrompt: NoPromptGrant, facts: PermissionFacts): PermissionGrant = when (whenNoPrompt) {
        NoPromptGrant.ALWAYS -> PermissionGrant.FULL
        NoPromptGrant.FOLLOWS_APP_NOTIFICATIONS ->
            if (facts.appNotificationsEnabled) PermissionGrant.FULL else PermissionGrant.NONE
    }
}

/** Où en est la demande d'un accès. `Idle` = rien à l'écran, aucune demande en cours. */
sealed interface PermissionFlowState {
    data object Idle : PermissionFlowState

    /** La feuille d'explication est affichée ; la boîte système viendra après « Continuer ». */
    data class Explaining(
        val nature: PermissionNature,
        val reason: PermissionExplainReason,
        val announcesRefusal: Boolean,
    ) : PermissionFlowState

    /** La boîte système est ouverte : on attend sa réponse. */
    data class AwaitingSystem(val nature: PermissionNature, val announcesRefusal: Boolean) : PermissionFlowState

    /** La carte « activer dans les Réglages » est affichée. */
    data class NeedsSettings(val nature: PermissionNature) : PermissionFlowState
}

sealed interface PermissionFlowEvent {
    data class Requested(
        val nature: PermissionNature,
        val snapshot: PermissionSnapshot,
        val announcesRefusal: Boolean = true,
    ) : PermissionFlowEvent

    /** « Continuer » sur la feuille d'explication. */
    data object Accepted : PermissionFlowEvent

    /** Feuille ou carte refermée sans suite. */
    data object Dismissed : PermissionFlowEvent

    /** La boîte système a répondu ; [snapshot] est relevé APRÈS la réponse. */
    data class SystemAnswered(val snapshot: PermissionSnapshot) : PermissionFlowEvent

    /** « Ouvrir les Réglages » sur la carte. */
    data object OpenSettingsTapped : PermissionFlowEvent

    /** L'app revient au premier plan (retour des Réglages, par exemple). */
    data class Resumed(val snapshot: PermissionSnapshot) : PermissionFlowEvent
}

sealed interface PermissionFlowEffect {
    /** L'accès est là : relancer l'action initiale sans geste de plus. */
    data object RunIntent : PermissionFlowEffect

    /** Pas d'accès : l'action initiale ne part pas, le retour est `false`. */
    data object AbandonIntent : PermissionFlowEffect

    data class LaunchSystemRequest(val nature: PermissionNature) : PermissionFlowEffect

    data object OpenSettings : PermissionFlowEffect
}

data class PermissionFlowTransition(
    val state: PermissionFlowState,
    val effect: PermissionFlowEffect? = null,
)

/**
 * La machine d'état de la porte unique. Pure : elle décide, l'hôte Android exécute les effets.
 *
 * Règles : on demande AVANT d'agir (jamais de boîte système sans explication préalable), après
 * un refus simple la demande suivante explique de nouveau, un refus définitif ne redemande
 * jamais mais renvoie vers les Réglages, et un retour des Réglages avec l'accès accordé
 * referme la carte et relance l'intention initiale.
 */
object PermissionFlowReducer {

    fun reduce(state: PermissionFlowState, event: PermissionFlowEvent): PermissionFlowTransition = when (event) {
        is PermissionFlowEvent.Requested -> onRequested(state, event)
        PermissionFlowEvent.Accepted -> onAccepted(state)
        PermissionFlowEvent.Dismissed -> onDismissed(state)
        is PermissionFlowEvent.SystemAnswered -> onSystemAnswered(state, event.snapshot)
        PermissionFlowEvent.OpenSettingsTapped -> onOpenSettings(state)
        is PermissionFlowEvent.Resumed -> onResumed(state, event.snapshot)
    }

    private fun stay(state: PermissionFlowState) = PermissionFlowTransition(state)

    private fun settle(effect: PermissionFlowEffect) = PermissionFlowTransition(PermissionFlowState.Idle, effect)

    private fun onRequested(state: PermissionFlowState, event: PermissionFlowEvent.Requested): PermissionFlowTransition {
        if (state != PermissionFlowState.Idle) return stay(state)
        return when (val step = PermissionRequestPlan.decide(event.snapshot)) {
            PermissionStep.Proceed -> settle(PermissionFlowEffect.RunIntent)
            is PermissionStep.ExplainThenRequest -> PermissionFlowTransition(
                PermissionFlowState.Explaining(event.nature, step.reason, event.announcesRefusal),
            )
            PermissionStep.SendToSettings -> toSettings(event.nature, event.announcesRefusal)
        }
    }

    private fun onAccepted(state: PermissionFlowState): PermissionFlowTransition {
        if (state !is PermissionFlowState.Explaining) return stay(state)
        return PermissionFlowTransition(
            PermissionFlowState.AwaitingSystem(state.nature, state.announcesRefusal),
            PermissionFlowEffect.LaunchSystemRequest(state.nature),
        )
    }

    private fun onDismissed(state: PermissionFlowState): PermissionFlowTransition = when (state) {
        is PermissionFlowState.Explaining, is PermissionFlowState.NeedsSettings ->
            settle(PermissionFlowEffect.AbandonIntent)
        else -> stay(state)
    }

    private fun onSystemAnswered(state: PermissionFlowState, snapshot: PermissionSnapshot): PermissionFlowTransition {
        if (state !is PermissionFlowState.AwaitingSystem) return stay(state)
        return when (PermissionRequestPlan.decide(snapshot)) {
            PermissionStep.Proceed -> settle(PermissionFlowEffect.RunIntent)
            is PermissionStep.ExplainThenRequest -> settle(PermissionFlowEffect.AbandonIntent)
            PermissionStep.SendToSettings -> toSettings(state.nature, state.announcesRefusal)
        }
    }

    private fun onOpenSettings(state: PermissionFlowState): PermissionFlowTransition =
        if (state is PermissionFlowState.NeedsSettings) {
            PermissionFlowTransition(state, PermissionFlowEffect.OpenSettings)
        } else {
            stay(state)
        }

    private fun onResumed(state: PermissionFlowState, snapshot: PermissionSnapshot): PermissionFlowTransition =
        if (state is PermissionFlowState.NeedsSettings && snapshot.state.isUsable) {
            settle(PermissionFlowEffect.RunIntent)
        } else {
            stay(state)
        }

    private fun toSettings(nature: PermissionNature, announcesRefusal: Boolean): PermissionFlowTransition =
        if (announcesRefusal) {
            PermissionFlowTransition(PermissionFlowState.NeedsSettings(nature))
        } else {
            settle(PermissionFlowEffect.AbandonIntent)
        }
}
