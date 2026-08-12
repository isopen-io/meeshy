package me.meeshy.app.calls

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import javax.inject.Inject
import javax.inject.Singleton

/**
 * A seam over the call-waiting banner's auto-dismiss countdown: [countdown] emits
 * exactly once, after the timeout, while it is collected. iOS auto-dismisses the
 * `CallWaitingBannerView` after 15 s and resolves the pending call **as a reject**
 * (the caller is left ringing otherwise); the [CallViewModel] treats a single
 * emission as that timeout.
 *
 * Isolating it behind an interface keeps the auto-dismiss behaviour driven by a
 * deterministic, injectable source in unit tests — no wall-clock `delay`, no
 * virtual-time bookkeeping — so the "ignored banner rejects the pending call"
 * rule is asserted through an ordinary flow emission.
 */
interface CallWaitingTimer {
    fun countdown(): Flow<Unit>
}

/** Production timer: emits once after the real 15 s auto-dismiss window elapses. */
@Singleton
class RealCallWaitingTimer @Inject constructor() : CallWaitingTimer {
    override fun countdown(): Flow<Unit> = flow {
        delay(AUTO_DISMISS_MS)
        emit(Unit)
    }

    private companion object {
        /** Matches the iOS `CallWaitingBannerView` 15 s auto-dismiss window. */
        const val AUTO_DISMISS_MS = 15_000L
    }
}

@Module
@InstallIn(SingletonComponent::class)
interface CallWaitingTimerModule {
    @Binds
    fun bindCallWaitingTimer(impl: RealCallWaitingTimer): CallWaitingTimer
}
