package me.meeshy.app.startup

import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ProcessLifecycleOwner
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import javax.inject.Inject
import me.meeshy.sdk.conversation.AppForegroundSignal

/** Publie le retour au premier plan du processus sur [AppForegroundSignal]. */
class AppForegroundInitializer @Inject constructor(
    private val signal: AppForegroundSignal,
) : AppInitializer {
    override fun initialize() {
        ProcessLifecycleOwner.get().lifecycle.addObserver(
            object : DefaultLifecycleObserver {
                override fun onStart(owner: LifecycleOwner) = signal.notifyEntered()
            },
        )
    }
}

@Module
@InstallIn(SingletonComponent::class)
interface AppForegroundModule {
    @Binds
    @IntoSet
    fun foregroundInitializer(impl: AppForegroundInitializer): AppInitializer
}
