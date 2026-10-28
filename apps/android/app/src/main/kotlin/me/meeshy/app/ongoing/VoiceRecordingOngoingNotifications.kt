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
 * Les boutons « Arrêter » et « Annuler » sont des diffuseurs dynamiques non exportés, enregistrés tant que
 * la prise existe — aucun composant déclaré au manifeste pour eux.
 */
@Singleton
internal class VoiceRecordingOngoingNotifications @Inject constructor(
    @ApplicationContext private val context: Context,
    private val bridge: VoiceRecordingActivityBridge,
    private val launcher: RecordingServiceLauncher,
) : OngoingNotificationSink<VoiceRecordingSnapshot> {

    private enum class ServiceState { None, Running, Refused }

    private var receiver: BroadcastReceiver? = null
    private var service = ServiceState.None

    init {
        VoiceRecordingService.refusal = ::onServiceRefused
    }

    override fun show(snapshot: VoiceRecordingSnapshot) {
        listenForButtons()
        OngoingChannel.ensure(context)
        if (service == ServiceState.None) {
            service = if (launcher.start(snapshot)) ServiceState.Running else ServiceState.Refused
            bridge.setKeepsRecordingInBackground(service == ServiceState.Running)
            if (service == ServiceState.Running) return
        }
        post(VoiceRecordingNotificationFactory.build(context, snapshot))
    }

    override fun conclude(snapshot: VoiceRecordingSnapshot, dismissAfterMs: Long) = cancel()

    override fun cancel() {
        if (service == ServiceState.Running) launcher.stop()
        service = ServiceState.None
        bridge.setKeepsRecordingInBackground(false)
        NotificationManagerCompat.from(context).cancel(NOTIFICATION_ID)
        receiver?.let { runCatching { context.unregisterReceiver(it) } }
        receiver = null
    }

    private fun onServiceRefused() {
        service = ServiceState.Refused
        bridge.setKeepsRecordingInBackground(false)
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
    private fun post(notification: Notification) {
        val manager = NotificationManagerCompat.from(context)
        if (!manager.areNotificationsEnabled()) return
        runCatching { manager.notify(NOTIFICATION_ID, notification) }
    }

    internal companion object {
        const val NOTIFICATION_ID: Int = 0x4d52
        const val ACTION_STOP: String = "me.meeshy.app.voice.RECORDING_STOP"
        const val ACTION_CANCEL: String = "me.meeshy.app.voice.RECORDING_CANCEL"
    }
}
