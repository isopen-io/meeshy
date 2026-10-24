package me.meeshy.app.push

import android.content.Context
import androidx.work.WorkManager
import dagger.hilt.android.qualifiers.ApplicationContext
import me.meeshy.app.push.pipeline.PushNotificationPipeline
import me.meeshy.sdk.outbox.OutboxFlushWorker
import javax.inject.Inject
import javax.inject.Singleton

/**
 * The message path of [PushMessageDispatcher] — every push that is neither a call nor a
 * revocation. Any such push hints that connectivity is back, so the outbox is flushed (as
 * before) ; the notification itself goes through [PushNotificationPipeline], which renders
 * data-only and legacy pushes alike, gated by the user's preferences.
 */
@Singleton
class MessageNotificationPresenter @Inject constructor(
    @ApplicationContext private val context: Context,
    private val pipeline: PushNotificationPipeline,
) {

    fun present(push: IncomingPush) {
        WorkManager.getInstance(context).enqueue(OutboxFlushWorker.buildRequest())
        pipeline.render(push)
    }
}
