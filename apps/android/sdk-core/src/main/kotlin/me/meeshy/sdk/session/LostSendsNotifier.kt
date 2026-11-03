package me.meeshy.sdk.session

import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton
import me.meeshy.sdk.R
import me.meeshy.sdk.feedback.FeedbackToastCenter
import me.meeshy.sdk.model.feedback.FeedbackToastKind

/** Prévient, par le toast global, que la session a été close par le serveur alors que des envois attendaient. */
@Singleton
public class LostSendsNotifier internal constructor(
    private val toasts: FeedbackToastCenter,
    private val message: (Int) -> String,
) {
    @Inject public constructor(
        @ApplicationContext context: Context,
        toasts: FeedbackToastCenter,
    ) : this(toasts, { count -> context.getString(R.string.session_lost_pending_sends, count) })

    public fun notify(count: Int) {
        if (count <= 0) return
        toasts.show(message(count), FeedbackToastKind.ERROR)
    }
}
