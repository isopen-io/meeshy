package me.meeshy.app.calls

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.flow.Flow
import me.meeshy.sdk.model.call.CallQualitySample

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

@Module
@InstallIn(SingletonComponent::class)
interface CallQualityModule {
    @Binds
    fun bindCallQualitySampler(impl: WebRtcCallQualitySampler): CallQualitySampler
}
