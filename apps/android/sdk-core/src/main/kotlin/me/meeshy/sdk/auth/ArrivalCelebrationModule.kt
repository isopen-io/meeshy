package me.meeshy.sdk.auth

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import me.meeshy.sdk.session.PerAccountCache
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
internal object ArrivalCelebrationModule {
    @Provides
    @Singleton
    fun controller(preload: ArrivalPreloading): ArrivalCelebrationController =
        ArrivalCelebrationController(preload, CoroutineScope(SupervisorJob() + Dispatchers.Default))

    @Provides
    fun celebrating(controller: ArrivalCelebrationController): ArrivalCelebrating = controller

    @Provides
    @IntoSet
    fun perAccountCache(controller: ArrivalCelebrationController): PerAccountCache = controller
}
