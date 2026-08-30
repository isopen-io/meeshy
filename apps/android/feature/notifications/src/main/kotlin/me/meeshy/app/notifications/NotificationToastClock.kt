package me.meeshy.app.notifications

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import java.time.LocalDateTime
import javax.inject.Inject
import javax.inject.Singleton

/**
 * A seam over wall-clock time for the in-app toast orchestrator ([NotificationToastViewModel]).
 * It needs BOTH forms: epoch millis for the dedup window ([ToastDedupWindow]) and a
 * [LocalDateTime] for the DND time-of-day check ([DndWindow.isActive]) the toast policy applies.
 * Injectable so a test pins both and asserts the exact dedup boundary and DND gating — no
 * sleeping, no zone-dependent conversion.
 */
interface NotificationToastClock {
    fun nowMillis(): Long
    fun localDateTime(): LocalDateTime
}

/** Production clock: plain wall time. */
@Singleton
class RealNotificationToastClock @Inject constructor() : NotificationToastClock {
    override fun nowMillis(): Long = System.currentTimeMillis()
    override fun localDateTime(): LocalDateTime = LocalDateTime.now()
}

@Module
@InstallIn(SingletonComponent::class)
interface NotificationToastClockModule {
    @Binds
    fun bindNotificationToastClock(impl: RealNotificationToastClock): NotificationToastClock
}
