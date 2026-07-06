package me.meeshy.app.calls

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emptyFlow
import me.meeshy.sdk.model.call.CallQualitySample
import javax.inject.Inject
import javax.inject.Singleton

/**
 * The input seam for live connection-quality stats: [samples] emits one
 * [CallQualitySample] per stats tick while it is collected. Isolating it behind
 * an interface keeps every *classification decision* in the pure
 * [me.meeshy.sdk.model.call.VideoQualityLevel] / [me.meeshy.sdk.model.call.ConnectionQuality]
 * SSOT + the [CallViewModel] fold, and leaves the concrete stats source as thin,
 * decision-free platform glue — so the VM's quality behaviour is asserted through
 * a fake flow, no WebRTC required.
 */
interface CallQualitySampler {
    val samples: Flow<CallQualitySample>
}

/**
 * Interim sampler: emits nothing, so the indicator stays hidden until the
 * self-managed WebRTC stats collector (which will swap this [dagger.Binds]) is
 * built as its own glue slice. The whole pipeline — seam → VM fold → presenter →
 * signal-bars UI — is live end-to-end; only the real stats source is pending.
 */
@Singleton
class NoopCallQualitySampler @Inject constructor() : CallQualitySampler {
    override val samples: Flow<CallQualitySample> = emptyFlow()
}

@Module
@InstallIn(SingletonComponent::class)
interface CallQualityModule {
    @Binds
    fun bindCallQualitySampler(impl: NoopCallQualitySampler): CallQualitySampler
}
