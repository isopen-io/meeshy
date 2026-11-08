package me.meeshy.sdk.model.auth

/**
 * Plan pur et ordonne d'ouverture et de fermeture de session — miroir de `SessionTransitionPlan`
 * (`apps/ios/Meeshy/App/SessionTransitionPlan.swift`). Il ne FAIT rien : il dit quoi, dans quel ordre ;
 * l'executeur (`SessionTransitionExecutor`) l'applique, une etape isolee des echecs des autres.
 */
public sealed interface SessionOpeningStep {
    public data class TagCrashReports(val userId: String?) : SessionOpeningStep
    public data object ReplayShareLinkAwaitingAccount : SessionOpeningStep
    public data object StartNotificationCoordinators : SessionOpeningStep
    public data object StartCache : SessionOpeningStep
    public data object ConfigureStoryPublishing : SessionOpeningStep
    public data object HydrateFriendships : SessionOpeningStep
    public data object ReconnectSockets : SessionOpeningStep
    public data object ActivateConversationStoreBridge : SessionOpeningStep
    public data object PromptPushPermission : SessionOpeningStep
    public data object RefreshUnreadCount : SessionOpeningStep
    public data object ReRegisterPushTokens : SessionOpeningStep

    /** Point d'ancrage : envoi du bundle E2EE de l'installation (inerte tant qu'Android n'a pas de coffre libsignal). */
    public data class StartEndToEnd(val userId: String?) : SessionOpeningStep
    public data object MigrateLegacyKeys : SessionOpeningStep
}

public sealed interface SessionClosingStep {
    /** Surfaces d'extension (hors de l'app) : elles montrent le compte quitte tant qu'on ne les vide pas. */
    public data object PurgeDynamicShortcuts : SessionClosingStep
    public data object PurgeWidgets : SessionClosingStep
    public data object CancelDisplayedNotifications : SessionClosingStep
    public data object UntagCrashReports : SessionClosingStep
    public data object ResetNotifications : SessionClosingStep
    public data object ClearFriendships : SessionClosingStep
    public data object ClearE2eeSessions : SessionClosingStep
    public data object StopEndToEnd : SessionClosingStep
    public data object UnbindCache : SessionClosingStep
    public data object UnregisterCallService : SessionClosingStep
    public data object EndActiveCall : SessionClosingStep
    public data object DisconnectSockets : SessionClosingStep
    public data object StopSocketRelays : SessionClosingStep
    public data object CancelBackgroundTasks : SessionClosingStep
}

public data class SessionTransitionContext(
    val userId: String?,
    val friendshipsHydrated: Boolean,
    val hasActiveCall: Boolean,
)

/** Une etape du plan d'une transition, ouverture ou fermeture. */
public sealed interface SessionTransitionStep {
    public data class Opening(val step: SessionOpeningStep) : SessionTransitionStep
    public data class Closing(val step: SessionClosingStep) : SessionTransitionStep
}

public object SessionTransitionPlan {

    public fun opening(context: SessionTransitionContext): List<SessionOpeningStep> = buildList {
        add(SessionOpeningStep.TagCrashReports(context.userId))
        add(SessionOpeningStep.ReplayShareLinkAwaitingAccount)
        add(SessionOpeningStep.StartNotificationCoordinators)
        add(SessionOpeningStep.StartCache)
        add(SessionOpeningStep.ConfigureStoryPublishing)
        if (!context.friendshipsHydrated) add(SessionOpeningStep.HydrateFriendships)
        add(SessionOpeningStep.ReconnectSockets)
        add(SessionOpeningStep.ActivateConversationStoreBridge)
        add(SessionOpeningStep.PromptPushPermission)
        add(SessionOpeningStep.RefreshUnreadCount)
        add(SessionOpeningStep.ReRegisterPushTokens)
        add(SessionOpeningStep.StartEndToEnd(context.userId))
        add(SessionOpeningStep.MigrateLegacyKeys)
    }

    public fun closing(context: SessionTransitionContext): List<SessionClosingStep> = buildList {
        add(SessionClosingStep.PurgeDynamicShortcuts)
        add(SessionClosingStep.PurgeWidgets)
        add(SessionClosingStep.CancelDisplayedNotifications)
        add(SessionClosingStep.UntagCrashReports)
        add(SessionClosingStep.ResetNotifications)
        add(SessionClosingStep.ClearFriendships)
        add(SessionClosingStep.ClearE2eeSessions)
        add(SessionClosingStep.StopEndToEnd)
        add(SessionClosingStep.UnbindCache)
        add(SessionClosingStep.UnregisterCallService)
        if (context.hasActiveCall) add(SessionClosingStep.EndActiveCall)
        add(SessionClosingStep.DisconnectSockets)
        add(SessionClosingStep.StopSocketRelays)
        add(SessionClosingStep.CancelBackgroundTasks)
    }

    /** Un seul plan par transition d'etat d'authentification ; une transition identique n'en a aucun. */
    public fun forTransition(
        wasAuthenticated: Boolean,
        isAuthenticated: Boolean,
        context: SessionTransitionContext,
    ): List<SessionTransitionStep> = when {
        !wasAuthenticated && isAuthenticated -> opening(context).map(SessionTransitionStep::Opening)
        wasAuthenticated && !isAuthenticated -> closing(context).map(SessionTransitionStep::Closing)
        else -> emptyList()
    }
}
