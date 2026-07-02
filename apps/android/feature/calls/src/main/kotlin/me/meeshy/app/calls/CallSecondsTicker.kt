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
 * A seam over the in-call 1-Hz clock: [seconds] emits once per elapsed second
 * while it is collected. Isolating it behind an interface keeps the
 * [CallViewModel]'s elapsed-time logic driven by a deterministic, injectable
 * source in unit tests — no wall-clock `delay`, no virtual-time bookkeeping — so
 * the timer's behaviour is asserted through ordinary flow emissions.
 */
interface CallSecondsTicker {
    val seconds: Flow<Unit>
}

/** Production ticker: a cold flow ticking once per real second while collected. */
@Singleton
class RealCallSecondsTicker @Inject constructor() : CallSecondsTicker {
    override val seconds: Flow<Unit> = flow {
        while (true) {
            delay(ONE_SECOND_MS)
            emit(Unit)
        }
    }

    private companion object {
        const val ONE_SECOND_MS = 1_000L
    }
}

@Module
@InstallIn(SingletonComponent::class)
interface CallTickerModule {
    @Binds
    fun bindCallSecondsTicker(impl: RealCallSecondsTicker): CallSecondsTicker
}
