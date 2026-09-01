package me.meeshy.app.notifications

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Inject
import javax.inject.Singleton

/**
 * A seam over monotonic wall-clock millis for the in-app toast orchestrators
 * ([NotificationToastViewModel], [NotificationBannerViewModel]). It feeds the dedup window
 * ([ToastDedupWindow]); the in-app banner gate ([NotificationToastPolicy]) is per-type only and
 * needs no time-of-day, so no `LocalDateTime` form is exposed. Injectable so a test pins the
 * clock and asserts the exact dedup boundary — no sleeping.
 */
interface NotificationToastClock {
    fun nowMillis(): Long
}

/** Production clock: plain wall time. */
@Singleton
class RealNotificationToastClock @Inject constructor() : NotificationToastClock {
    override fun nowMillis(): Long = System.currentTimeMillis()
}

@Module
@InstallIn(SingletonComponent::class)
interface NotificationToastClockModule {
    @Binds
    fun bindNotificationToastClock(impl: RealNotificationToastClock): NotificationToastClock
}
