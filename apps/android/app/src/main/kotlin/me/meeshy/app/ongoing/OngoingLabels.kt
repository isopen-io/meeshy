package me.meeshy.app.ongoing

import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
import me.meeshy.app.R
import me.meeshy.sdk.model.ongoing.LiveActivityLabels
import javax.inject.Inject
import javax.inject.Singleton

/** Les libellés des plans, relus à chaque plan pour suivre la langue d'interface du moment. */
@Singleton
internal class OngoingLabels @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    fun current(): LiveActivityLabels = LiveActivityLabels(
        publicText = context.getString(R.string.ongoing_activity_public),
        protectedMessage = context.getString(R.string.ongoing_playback_protected),
        waitingNetwork = context.getString(R.string.outbox_activity_waiting_network),
        pause = context.getString(R.string.ongoing_action_pause),
        resume = context.getString(R.string.ongoing_action_resume),
        close = context.getString(R.string.ongoing_action_close),
        stop = context.getString(R.string.voice_recording_activity_stop),
        cancel = context.getString(R.string.ongoing_action_cancel),
        hangUp = context.getString(R.string.ongoing_action_hang_up),
        mute = context.getString(R.string.ongoing_action_mute),
        unmute = context.getString(R.string.ongoing_action_unmute),
        sentOfTotal = { sent, total -> context.getString(R.string.ongoing_outbox_sent_of_total, sent, total) },
        remaining = { context.getString(R.string.outbox_activity_remaining, it) },
    )
}
