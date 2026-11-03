package me.meeshy.app.session

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.pm.ShortcutInfoCompat
import androidx.core.content.pm.ShortcutManagerCompat
import androidx.test.core.app.ApplicationProvider
import androidx.work.WorkManager
import com.google.common.truth.Truth.assertThat
import io.mockk.coVerify
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.test.runTest
import me.meeshy.app.calls.ActiveCallSnapshotHolder
import me.meeshy.app.calls.CallServiceController
import me.meeshy.app.push.PushTokenHandler
import me.meeshy.app.widget.WidgetRefresher
import me.meeshy.sdk.friend.FriendRepository
import me.meeshy.sdk.friend.FriendshipCache
import me.meeshy.sdk.model.auth.SessionClosingStep
import me.meeshy.sdk.notification.NotificationRepository
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.RealtimeSessionCoordinator
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class AppSessionStepRunnerTest {

    private val context: Context = ApplicationProvider.getApplicationContext<Application>()
    private val friendships: FriendshipCache = mockk(relaxed = true)
    private val notifications: NotificationRepository = mockk(relaxed = true)
    private val realtime: RealtimeSessionCoordinator = mockk(relaxed = true)
    private val callService: CallServiceController = mockk(relaxed = true)
    private val workManager: WorkManager = mockk(relaxed = true)
    private val widgets: WidgetRefresher = mockk(relaxed = true)
    private val activeCall: ActiveCallSnapshotHolder = mockk(relaxed = true)

    private fun runner() = AppSessionStepRunner(
        context = context,
        sessionRepository = mockk<SessionRepository>(relaxed = true),
        friendshipCache = friendships,
        friendRepository = mockk<FriendRepository>(relaxed = true),
        notificationRepository = notifications,
        realtime = realtime,
        activeCall = activeCall,
        callService = callService,
        workManager = workManager,
        widgets = widgets,
        pushTokens = mockk<PushTokenHandler>(relaxed = true),
    )

    @Test
    fun `purger les raccourcis vide le gestionnaire de raccourcis dynamiques`() = runTest {
        val shortcut = ShortcutInfoCompat.Builder(context, "c1")
            .setShortLabel("c1")
            .setIntent(Intent(Intent.ACTION_VIEW))
            .build()
        ShortcutManagerCompat.setDynamicShortcuts(context, listOf(shortcut))
        assertThat(ShortcutManagerCompat.getDynamicShortcuts(context)).isNotEmpty()

        runner().run(SessionClosingStep.PurgeDynamicShortcuts)

        assertThat(ShortcutManagerCompat.getDynamicShortcuts(context)).isEmpty()
    }

    @Test
    fun `annuler les notifications affichees retire celles de l'ancien compte`() = runTest {
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.createNotificationChannel(NotificationChannel("t", "t", NotificationManager.IMPORTANCE_DEFAULT))
        val notification = NotificationCompat.Builder(context, "t").setSmallIcon(android.R.drawable.ic_dialog_info).build()
        @Suppress("MissingPermission")
        NotificationManagerCompat.from(context).notify(1, notification)
        assertThat(manager.activeNotifications).isNotEmpty()

        runner().run(SessionClosingStep.CancelDisplayedNotifications)

        assertThat(manager.activeNotifications).isEmpty()
    }

    @Test
    fun `purger les widgets les repeint`() = runTest {
        runner().run(SessionClosingStep.PurgeWidgets)
        coVerify { widgets.repaintAll() }
    }

    @Test
    fun `la fermeture annule les taches de fond, coupe les sockets et termine l'appel`() = runTest {
        val runner = runner()
        runner.run(SessionClosingStep.CancelBackgroundTasks)
        runner.run(SessionClosingStep.DisconnectSockets)
        runner.run(SessionClosingStep.EndActiveCall)
        runner.run(SessionClosingStep.UnregisterCallService)
        runner.run(SessionClosingStep.ResetNotifications)
        runner.run(SessionClosingStep.ClearFriendships)

        AppSessionStepRunner.SESSION_WORK_TAGS.forEach { verify { workManager.cancelAllWorkByTag(it) } }
        verify(exactly = 0) { workManager.cancelAllWork() }
        assertThat(AppSessionStepRunner.SESSION_WORK_TAGS).doesNotContain(me.meeshy.sdk.auth.ServerLogoutWorker::class.java.name)
        verify { realtime.closeRealtime() }
        verify { activeCall.hangUp() }
        verify { callService.sync(null) }
        verify { notifications.clear() }
        verify { friendships.clear() }
    }
}
