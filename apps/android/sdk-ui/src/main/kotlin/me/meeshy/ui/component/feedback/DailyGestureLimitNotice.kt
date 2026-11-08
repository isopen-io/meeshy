package me.meeshy.ui.component.feedback

import android.content.Context
import me.meeshy.sdk.model.feedback.DailyGestureLimit
import me.meeshy.ui.R

/** Le message d'un refus de limite quotidienne, dans la langue de l'app, avec l'heure de remise à zéro au fuseau de l'appareil. */
public fun dailyGestureLimitMessage(context: Context, limit: DailyGestureLimit): String {
    val time = limit.resetTimeLabel()
    val comment = limit.gesture == DailyGestureLimit.Gesture.COMMENT
    return when {
        time == null && comment -> context.getString(R.string.post_daily_limit_comment_untimed)
        time == null -> context.getString(R.string.post_daily_limit_reaction_untimed)
        comment -> context.getString(R.string.post_daily_limit_comment, time)
        else -> context.getString(R.string.post_daily_limit_reaction, time)
    }
}
