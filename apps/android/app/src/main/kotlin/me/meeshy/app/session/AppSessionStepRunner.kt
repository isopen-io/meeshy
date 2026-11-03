package me.meeshy.app.session

import android.content.Context
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.pm.ShortcutManagerCompat
import androidx.work.WorkManager
import me.meeshy.sdk.e2ee.E2eeBundlePublishWorker
import me.meeshy.sdk.outbox.OutboxFlushWorker
import com.google.firebase.messaging.FirebaseMessaging
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Inject
import javax.inject.Singleton
import me.meeshy.app.calls.ActiveCallSnapshotHolder
import me.meeshy.app.calls.CallServiceController
import me.meeshy.app.push.FirebaseAvailability
import me.meeshy.app.push.PushTokenHandler
import me.meeshy.app.widget.WidgetRefresher
import me.meeshy.sdk.friend.FriendRepository
import me.meeshy.sdk.friend.FriendshipCache
import me.meeshy.sdk.model.auth.SessionClosingStep
import me.meeshy.sdk.model.auth.SessionOpeningStep
import me.meeshy.sdk.model.auth.SessionTransitionContext
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.notification.NotificationRepository
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.session.SessionStepRunner
import me.meeshy.sdk.socket.RealtimeSessionCoordinator
import timber.log.Timber

/**
 * Ce que chaque etape du plan de session fait sur Android. Les etapes sans objet ici (balise de crash, coffre E2EE,
 * migration de trousseau) sont des points d'ancrage inertes, comme leurs pendants iOS tant que la capacite manque.
 * `UnbindCache` est porte par `SessionTeardown.wipe()`, que la deconnexion execute juste apres la fermeture.
 */
@Singleton
class AppSessionStepRunner @Inject constructor(
    @ApplicationContext private val context: Context,
    private val sessionRepository: SessionRepository,
    private val friendshipCache: FriendshipCache,
    private val friendRepository: FriendRepository,
    private val notificationRepository: NotificationRepository,
    private val realtime: RealtimeSessionCoordinator,
    private val activeCall: ActiveCallSnapshotHolder,
    private val callService: CallServiceController,
    private val workManager: WorkManager,
    private val widgets: WidgetRefresher,
    private val pushTokens: PushTokenHandler,
) : SessionStepRunner {

    override suspend fun context(): SessionTransitionContext = SessionTransitionContext(
        userId = sessionRepository.currentUserId,
        friendshipsHydrated = false, // hydrateCoalesced est lui-meme coalesce : une seconde hydratation ne repart pas
        hasActiveCall = activeCall.snapshot.value != null,
    )

    override suspend fun run(step: SessionOpeningStep) {
        when (step) {
            SessionOpeningStep.HydrateFriendships -> friendshipCache.hydrateCoalesced(fetch = {
                friendRepository.friendshipGraph(sessionRepository.currentUserId.orEmpty()).getOrNull()
            })
            SessionOpeningStep.ReconnectSockets -> realtime.openRealtime()
            SessionOpeningStep.RefreshUnreadCount ->
                (notificationRepository.unreadCount() as? NetworkResult.Success)?.let { notificationRepository.applyCounts(it.data) }
            SessionOpeningStep.ReRegisterPushTokens -> reRegisterPushToken()
            is SessionOpeningStep.TagCrashReports,
            SessionOpeningStep.ReplayShareLinkAwaitingAccount,
            SessionOpeningStep.StartNotificationCoordinators,
            SessionOpeningStep.StartCache,
            SessionOpeningStep.ConfigureStoryPublishing,
            SessionOpeningStep.ActivateConversationStoreBridge,
            SessionOpeningStep.PromptPushPermission,
            is SessionOpeningStep.StartEndToEnd,
            SessionOpeningStep.MigrateLegacyKeys,
            -> Unit
        }
    }

    override suspend fun run(step: SessionClosingStep) {
        when (step) {
            SessionClosingStep.PurgeDynamicShortcuts -> ShortcutManagerCompat.removeAllDynamicShortcuts(context)
            SessionClosingStep.PurgeWidgets -> widgets.repaintAll()
            SessionClosingStep.CancelDisplayedNotifications -> NotificationManagerCompat.from(context).cancelAll()
            SessionClosingStep.ResetNotifications -> notificationRepository.clear()
            SessionClosingStep.ClearFriendships -> friendshipCache.clear()
            SessionClosingStep.UnregisterCallService -> callService.sync(null)
            SessionClosingStep.EndActiveCall -> activeCall.hangUp()
            SessionClosingStep.DisconnectSockets -> realtime.closeRealtime()
            SessionClosingStep.CancelBackgroundTasks -> SESSION_WORK_TAGS.forEach { workManager.cancelAllWorkByTag(it) }
            SessionClosingStep.UntagCrashReports,
            SessionClosingStep.ClearE2eeSessions,
            SessionClosingStep.StopEndToEnd,
            SessionClosingStep.UnbindCache,
            SessionClosingStep.StopSocketRelays,
            -> Unit
        }
    }

    internal companion object {
        /**
         * Les travaux de la session qui se ferme, par leur étiquette automatique (nom de classe). Jamais
         * `cancelAllWork()` : la fermeture serveur d'une session quittée (`ServerLogoutWorker`) survit à la suivante.
         */
        val SESSION_WORK_TAGS: List<String> = listOf(
            OutboxFlushWorker::class.java.name,
            E2eeBundlePublishWorker::class.java.name,
        )
    }

    private fun reRegisterPushToken() {
        if (!FirebaseAvailability.isConfigured(context)) return
        FirebaseMessaging.getInstance().token
            .addOnSuccessListener { token -> pushTokens.onTokenRefresh(token) }
            .addOnFailureListener { Timber.w("Jeton FCM illisible : %s", it.javaClass.simpleName) }
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal interface SessionStepRunnerModule {
    @Binds
    fun sessionStepRunner(impl: AppSessionStepRunner): SessionStepRunner
}
