package me.meeshy.sdk.socket

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import me.meeshy.sdk.lifecycle.AppLifecycleHook
import javax.inject.Inject

/** Relaie ON_START / ON_STOP du process au [SocketLifecycleBinder] (sans éditer `MeeshyApplication`). */
class SocketLifecycleHook @Inject constructor(
    private val binder: SocketLifecycleBinder,
) : AppLifecycleHook {
    override val priority: Int get() = -100

    override suspend fun onForeground() = binder.onProcessStart()

    override suspend fun onBackground() = binder.onProcessStop()
}

@Module
@InstallIn(SingletonComponent::class)
internal abstract class SocketLifecycleModule {
    @Binds
    @IntoSet
    abstract fun bindsSocketLifecycleHook(impl: SocketLifecycleHook): AppLifecycleHook
}
