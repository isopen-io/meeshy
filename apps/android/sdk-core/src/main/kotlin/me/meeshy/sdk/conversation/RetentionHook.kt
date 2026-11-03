package me.meeshy.sdk.conversation

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import javax.inject.Inject
import me.meeshy.sdk.lifecycle.AppLifecycleHook

/** Au lancement, n'enregistre que la planification : la purge elle-même attend l'appareil au repos. */
public class RetentionHook @Inject constructor(
    private val scheduler: RetentionScheduler,
) : AppLifecycleHook {
    override val name: String get() = "message-retention"

    override suspend fun onAppCreate() {
        scheduler.schedule()
    }
}

@Module
@InstallIn(SingletonComponent::class)
public abstract class RetentionModule {
    @Binds public abstract fun bindScheduler(impl: WorkManagerRetentionScheduler): RetentionScheduler

    @Binds @IntoSet
    public abstract fun bindHook(impl: RetentionHook): AppLifecycleHook
}
