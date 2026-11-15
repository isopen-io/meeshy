package me.meeshy.sdk.model.auth

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class SessionTransitionPlanTest {

    private fun context(
        userId: String? = "u1",
        friendshipsHydrated: Boolean = false,
        hasActiveCall: Boolean = false,
    ) = SessionTransitionContext(userId, friendshipsHydrated, hasActiveCall)

    @Test
    fun `une ouverture execute les treize etapes dans l'ordre d'iOS`() {
        val steps = SessionTransitionPlan.opening(context())
        assertThat(steps).containsExactly(
            SessionOpeningStep.TagCrashReports("u1"),
            SessionOpeningStep.ReplayShareLinkAwaitingAccount,
            SessionOpeningStep.StartNotificationCoordinators,
            SessionOpeningStep.StartCache,
            SessionOpeningStep.ConfigureStoryPublishing,
            SessionOpeningStep.HydrateFriendships,
            SessionOpeningStep.ReconnectSockets,
            SessionOpeningStep.ActivateConversationStoreBridge,
            SessionOpeningStep.PromptPushPermission,
            SessionOpeningStep.RefreshUnreadCount,
            SessionOpeningStep.ReRegisterPushTokens,
            SessionOpeningStep.StartEndToEnd("u1"),
            SessionOpeningStep.MigrateLegacyKeys,
        ).inOrder()
    }

    @Test
    fun `des amities deja hydratees ne sont pas hydratees deux fois`() {
        val steps = SessionTransitionPlan.opening(context(friendshipsHydrated = true))
        assertThat(steps).doesNotContain(SessionOpeningStep.HydrateFriendships)
        assertThat(steps).hasSize(12)
    }

    @Test
    fun `une fermeture purge les surfaces d'extension en premier`() {
        val steps = SessionTransitionPlan.closing(context())
        assertThat(steps.take(3)).containsExactly(
            SessionClosingStep.PurgeDynamicShortcuts,
            SessionClosingStep.PurgeWidgets,
            SessionClosingStep.CancelDisplayedNotifications,
        ).inOrder()
    }

    @Test
    fun `une fermeture sans appel actif ne termine aucun appel`() {
        val steps = SessionTransitionPlan.closing(context(hasActiveCall = false))
        assertThat(steps).doesNotContain(SessionClosingStep.EndActiveCall)
    }

    @Test
    fun `une fermeture avec appel actif le termine apres le service d'appel et avant les sockets`() {
        val steps = SessionTransitionPlan.closing(context(hasActiveCall = true))
        assertThat(steps).containsExactly(
            SessionClosingStep.PurgeDynamicShortcuts,
            SessionClosingStep.PurgeWidgets,
            SessionClosingStep.CancelDisplayedNotifications,
            SessionClosingStep.UntagCrashReports,
            SessionClosingStep.ResetNotifications,
            SessionClosingStep.ClearFriendships,
            SessionClosingStep.ClearE2eeSessions,
            SessionClosingStep.StopEndToEnd,
            SessionClosingStep.UnbindCache,
            SessionClosingStep.UnregisterCallService,
            SessionClosingStep.EndActiveCall,
            SessionClosingStep.DisconnectSockets,
            SessionClosingStep.StopSocketRelays,
            SessionClosingStep.CancelBackgroundTasks,
        ).inOrder()
    }

    @Test
    fun `une transition identique ne produit aucun plan`() {
        assertThat(SessionTransitionPlan.forTransition(false, false, context())).isEmpty()
        assertThat(SessionTransitionPlan.forTransition(true, true, context())).isEmpty()
    }

    @Test
    fun `une transition deconnecte vers connecte ouvre et connecte vers deconnecte ferme`() {
        val opened = SessionTransitionPlan.forTransition(false, true, context())
        assertThat(opened.filterIsInstance<SessionTransitionStep.Opening>()).isNotEmpty()
        assertThat(opened.filterIsInstance<SessionTransitionStep.Closing>()).isEmpty()
        val closed = SessionTransitionPlan.forTransition(true, false, context())
        assertThat(closed.filterIsInstance<SessionTransitionStep.Closing>()).isNotEmpty()
        assertThat(closed.filterIsInstance<SessionTransitionStep.Opening>()).isEmpty()
    }
}
