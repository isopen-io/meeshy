package me.meeshy.sdk.engagement

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import me.meeshy.sdk.session.PerAccountCache

/** La progression est vidée à la déconnexion et au changement de compte : un second compte n'hérite de rien. */
@Module
@InstallIn(SingletonComponent::class)
internal abstract class EngagementAccountCacheModule {
    @Binds
    @IntoSet
    abstract fun bindAccountCache(repository: EngagementProgressRepository): PerAccountCache
}
