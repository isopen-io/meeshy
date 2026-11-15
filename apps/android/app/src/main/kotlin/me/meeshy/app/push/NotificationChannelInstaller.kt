package me.meeshy.app.push

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationChannelGroup as AndroidChannelGroup
import android.app.NotificationManager
import android.content.Context
import android.media.AudioAttributes
import android.media.RingtoneManager
import androidx.core.content.getSystemService
import dagger.hilt.android.qualifiers.ApplicationContext
import me.meeshy.app.R
import me.meeshy.sdk.model.NotificationChannelGroup as PlanGroup
import me.meeshy.sdk.model.NotificationChannelPlan
import me.meeshy.sdk.model.NotificationChannelSound
import me.meeshy.sdk.model.NotificationChannelSpec
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Eagerly creates the app's notification channels at process start
 * ([me.meeshy.app.MeeshyApplication.onCreate]) — NOT lazily inside
 * [MeeshyFcmService.onMessageReceived], which never runs for a push the OS
 * auto-renders while the app is backgrounded or killed (see [NotificationChannelIds]
 * for why that path exists and why the id must match the gateway's).
 *
 * Installs one channel per category — [NotificationChannelIds.CHANNEL_MESSAGES_V2],
 * [NotificationChannelIds.CHANNEL_SOCIAL_V2], [NotificationChannelIds.CHANNEL_SYSTEM_V2] — and the
 * quiet [NotificationChannelIds.CHANNEL_SILENT] the push pipeline posts to when the preferences
 * refuse an alert. Each v1 predecessor is deleted (one « Messages » entry in the system settings,
 * never two) after its user-set mute is carried over. The calls channel is always reached through a data-only push,
 * so `onMessageReceived` always runs for it ; the installer still registers it (idempotent) so the settings list it.
 */
@Singleton
class NotificationChannelInstaller @Inject constructor(
    @ApplicationContext private val context: Context,
) {

    /**
     * [strings] porte la langue des libelles : l'application au demarrage, un contexte localise
     * quand la langue d'interface change (les canaux se renomment sans redemarrage).
     */
    fun install(strings: Context = context) {
        val manager = context.getSystemService<NotificationManager>() ?: return

        PlanGroup.entries.forEach { group ->
            manager.createNotificationChannelGroup(AndroidChannelGroup(group.id, strings.getString(groupName(group))))
        }
        NotificationChannelPlan.channels.forEach { spec ->
            val legacyId = LEGACY_PREDECESSORS[spec.id]
            val importance = legacyId
                ?.let { carriedImportance(manager, spec.id, it, spec.importance.androidLevel) }
                ?: spec.importance.androidLevel
            manager.createNotificationChannel(channel(strings, spec, importance))
            legacyId?.let(manager::deleteNotificationChannel)
        }
        manager.deleteNotificationChannel(NotificationChannelIds.LEGACY_CHANNEL_CALLS)
        manager.createNotificationChannel(
            NotificationChannel(
                NotificationChannelIds.CHANNEL_SILENT,
                strings.getString(R.string.push_channel_silent_name),
                NotificationManager.IMPORTANCE_LOW,
            ).apply {
                description = strings.getString(R.string.push_channel_silent_description)
                setSound(null, null)
                enableVibration(false)
                setShowBadge(true)
            },
        )
        me.meeshy.app.ongoing.OngoingChannel.ensure(context)
        // Renamed away from — delete the orphaned pre-drift channel so a returning
        // install doesn't carry a dead, possibly user-muted duplicate around forever.
        manager.deleteNotificationChannel(NotificationChannelIds.LEGACY_CHANNEL_MESSAGES)
    }

    private fun channel(strings: Context, spec: NotificationChannelSpec, importance: Int): NotificationChannel {
        val labels = labelsOf(spec.id)
        return NotificationChannel(spec.id, strings.getString(labels.first), importance).apply {
            description = strings.getString(labels.second)
            group = spec.group.id
            enableVibration(spec.vibrate)
            when (spec.sound) {
                NotificationChannelSound.DEFAULT -> Unit
                NotificationChannelSound.NONE -> setSound(null, null)
                // Sonnerie APPAREIL en usage ring : le canal sonne comme un appel, volume sonnerie respecté.
                NotificationChannelSound.RINGTONE -> {
                    setSound(
                        RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE),
                        AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                            .build(),
                    )
                    vibrationPattern = RING_VIBRATION
                    setShowBadge(false)
                }
            }
            if (spec.vibrate && spec.sound != NotificationChannelSound.RINGTONE) {
                lockscreenVisibility = Notification.VISIBILITY_PRIVATE
            }
        }
    }

    private fun labelsOf(id: String): Pair<Int, Int> = when (id) {
        NotificationChannelPlan.MESSAGES -> R.string.push_channel_messages_name to R.string.push_channel_messages_description
        NotificationChannelPlan.MENTIONS -> R.string.push_channel_mentions_name to R.string.push_channel_mentions_description
        NotificationChannelPlan.EPHEMERAL -> R.string.push_channel_ephemeral_name to R.string.push_channel_ephemeral_description
        NotificationChannelPlan.FRIENDS -> R.string.push_channel_friends_name to R.string.push_channel_friends_description
        NotificationChannelPlan.SOCIAL -> R.string.push_channel_social_name to R.string.push_channel_social_description
        NotificationChannelPlan.CALLS -> R.string.call_channel_name to R.string.call_channel_description
        NotificationChannelPlan.CALLS_MISSED -> R.string.push_channel_calls_missed_name to R.string.push_channel_calls_missed_description
        NotificationChannelPlan.INVITATIONS -> R.string.push_channel_invitations_name to R.string.push_channel_invitations_description
        else -> R.string.push_channel_system_name to R.string.push_channel_system_description
    }

    private fun groupName(group: PlanGroup): Int = when (group) {
        PlanGroup.MESSAGES -> R.string.push_group_messages
        PlanGroup.SOCIAL -> R.string.push_group_social
        PlanGroup.FRIENDS -> R.string.push_group_friends
        PlanGroup.CALLS -> R.string.push_group_calls
        PlanGroup.OTHERS -> R.string.push_group_others
    }

    /**
     * Un canal v2 créé pour la première fois reprend la COUPURE que l'utilisateur avait posée sur
     * son prédécesseur (bloqué, ou baissé) : la migration rend la vibration, jamais un bruit qu'on
     * avait fait taire. Le son ou la vibration personnalisés du v1 ne se lisent pas de façon fiable
     * et ne sont pas repris.
     */
    private fun carriedImportance(manager: NotificationManager, id: String, legacyId: String, importance: Int): Int {
        if (manager.getNotificationChannel(id) != null) return importance
        val legacy = manager.getNotificationChannel(legacyId)?.importance ?: return importance
        return minOf(legacy, importance)
    }

    private companion object {
        val RING_VIBRATION = longArrayOf(0, 1_000, 800, 1_000, 800)
        val LEGACY_PREDECESSORS = mapOf(
            NotificationChannelPlan.MESSAGES to NotificationChannelIds.CHANNEL_MESSAGES,
            NotificationChannelPlan.SOCIAL to NotificationChannelIds.CHANNEL_SOCIAL,
            NotificationChannelPlan.SYSTEM to NotificationChannelIds.CHANNEL_SYSTEM,
        )
    }
}
