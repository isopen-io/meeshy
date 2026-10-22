package me.meeshy.sdk.network

import android.content.Context
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import javax.inject.Singleton

/**
 * Binds the single network path of the process and its binary reading. The qualitative reading
 * ([me.meeshy.sdk.media.NetworkConditionMonitor]) is bound in `SdkModule` over the SAME
 * [NetworkPathSource], so there is exactly one `registerDefaultNetworkCallback` in the app.
 * Boilerplate DI: the decidable logic lives in `NetworkReachabilityReducer` and is covered there.
 */
@Module
@InstallIn(SingletonComponent::class)
public object NetworkReachabilityModule {

    @Provides
    @Singleton
    public fun providesNetworkPathSource(@ApplicationContext context: Context): NetworkPathSource =
        AndroidNetworkPathSource(context)

    @Provides
    @Singleton
    public fun providesNetworkMonitor(source: NetworkPathSource): NetworkMonitor =
        AndroidNetworkMonitor(source, CoroutineScope(SupervisorJob() + Dispatchers.Default))
}
