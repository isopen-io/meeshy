package me.meeshy.app.ongoing

import android.annotation.SuppressLint
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.app.Notification
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import dagger.hilt.android.qualifiers.ApplicationContext
import me.meeshy.app.push.NotificationChannelIds
import me.meeshy.sdk.model.ongoing.VoiceRecordingBackgroundLaw
import me.meeshy.sdk.model.ongoing.VoiceRecordingSnapshot
import javax.inject.Inject
import javax.inject.Singleton

/**
 * La notification d'un vocal en cours, côté app : à l'ouverture de la prise elle démarre le service de
 * premier plan `microphone` ([VoiceRecordingService]), qui porte la notification et garde le micro quand
 * l'app quitte l'écran ; à sa fin elle l'arrête. Si le système refuse le service, la notification reste
 * posée comme avant (app au premier plan seulement) et le pont le sait : l'écran range alors la prise
 * dans le tiroir en quittant, au lieu de la laisser s'enregistrer muette.
 *
 * Le service n'est demandé que si la notification peut se voir : un micro qui tourne hors de l'écran sans
 * rien qui le montre n'est jamais une option.
 *
 * Si le système retire le premier plan APRÈS l'avoir accordé ([VoiceRecordingBackgroundLaw.onServiceLost]) :
 * app à l'écran, la notification d'avant est reposée ; app partie, la prise est arrêtée dans le tiroir et un
 * avis le dit — jamais une prise perdue sans que l'utilisateur le sache.
 *
 * Les boutons « Arrêter » et « Annuler » sont des diffuseurs dynamiques non exportés, enregistrés tant que
 * la prise existe — aucun composant déclaré au manifeste pour eux.
 */
@Singleton
internal class VoiceRecordingOngoingNotifications @Inject constructor(
    @ApplicationContext private val context: Context,
    private val bridge: VoiceRecordingActivityBridge,
    private val launcher: RecordingServiceLauncher,
    private val foreground: ProcessForegroundState,
) : OngoingNotificationSink<VoiceRecordingSnapshot> {

    private enum class ServiceState { None, Running, Refused }

    private var receiver: BroadcastReceiver? = null
    private var service = ServiceState.None
    private var current: VoiceRecordingSnapshot? = null

    init {
        VoiceRecordingService.refusal = ::onServiceRefused
    }

    override fun show(snapshot: VoiceRecordingSnapshot) {
        listenForButtons()
        OngoingChannel.ensure(context)
        current = snapshot
        if (service == ServiceState.None) {
            service = if (canBeSeen() && launcher.start(snapshot)) ServiceState.Running else ServiceState.Refused
            bridge.setKeepsRecordingInBackground(service == ServiceState.Running)
            if (service == ServiceState.Running) return
        }
        post(VoiceRecordingNotificationFactory.build(context, snapshot))
    }

    override fun conclude(snapshot: VoiceRecordingSnapshot, dismissAfterMs: Long) = cancel()

    override fun cancel() {
        if (service == ServiceState.Running) launcher.stop()
        service = ServiceState.None
        current = null
        bridge.setKeepsRecordingInBackground(false)
        NotificationManagerCompat.from(context).cancel(NOTIFICATION_ID)
        receiver?.let { runCatching { context.unregisterReceiver(it) } }
        receiver = null
    }

    /**
     * Un micro qui continue hors de l'écran doit se VOIR : notifications de l'app coupées ou canal « en cours »
     * bloqué, le service n'est pas demandé et la prise suit l'ancien chemin (rangée dans le tiroir en quittant).
     */
    private fun canBeSeen(): Boolean {
        val manager = NotificationManagerCompat.from(context)
        if (!manager.areNotificationsEnabled()) return false
        val channel = manager.getNotificationChannelCompat(NotificationChannelIds.CHANNEL_ONGOING) ?: return true
        return channel.importance != NotificationManagerCompat.IMPORTANCE_NONE
    }

    private fun onServiceRefused() {
        if (service != ServiceState.Running) return
        service = ServiceState.Refused
        bridge.setKeepsRecordingInBackground(false)
        val take = current
        val decision = VoiceRecordingBackgroundLaw.onServiceLost(isRecording = take != null, appVisible = foreground.isForeground.value)
        when (decision) {
            VoiceRecordingBackgroundLaw.Decision.Nothing -> Unit
            VoiceRecordingBackgroundLaw.Decision.KeepRecording -> take?.let { post(VoiceRecordingNotificationFactory.build(context, it)) }
            VoiceRecordingBackgroundLaw.Decision.AbandonToTray -> {
                bridge.requestStop()
                post(VoiceRecordingNotificationFactory.keptInTray(context), KEPT_IN_TRAY_ID)
            }
        }
    }

    private fun listenForButtons() {
        if (receiver != null) return
        val created = object : BroadcastReceiver() {
            override fun onReceive(context: Context?, intent: Intent?) {
                when (intent?.action) {
                    ACTION_STOP -> bridge.requestStop()
                    ACTION_CANCEL -> bridge.requestCancel()
                }
            }
        }
        val filter = IntentFilter().apply {
            addAction(ACTION_STOP)
            addAction(ACTION_CANCEL)
        }
        ContextCompat.registerReceiver(context, created, filter, ContextCompat.RECEIVER_NOT_EXPORTED)
        receiver = created
    }

    @SuppressLint("MissingPermission")
    private fun post(notification: Notification, id: Int = NOTIFICATION_ID) {
        val manager = NotificationManagerCompat.from(context)
        if (!manager.areNotificationsEnabled()) return
        runCatching { manager.notify(id, notification) }
    }

    internal companion object {
        const val NOTIFICATION_ID: Int = 0x4d52
        const val KEPT_IN_TRAY_ID: Int = 0x4d53
        const val ACTION_STOP: String = "me.meeshy.app.voice.RECORDING_STOP"
        const val ACTION_CANCEL: String = "me.meeshy.app.voice.RECORDING_CANCEL"
    }
}
