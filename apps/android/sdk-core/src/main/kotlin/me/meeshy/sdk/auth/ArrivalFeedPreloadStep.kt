package me.meeshy.sdk.auth

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent

import dagger.multibindings.IntoSet
import me.meeshy.sdk.post.PostRepository
import javax.inject.Inject

/** Le fil : le même chargeur que l'écran, donc la même clé de cache que relisent le fil ET le lecteur de réels. */
internal class ArrivalFeedPreloadStep @Inject constructor(
    private val posts: PostRepository,
) : ArrivalPreloadStep {
    override suspend fun preload() = posts.refresh()
}

@Module
@InstallIn(SingletonComponent::class)
internal abstract class ArrivalFeedPreloadModule {
    @Binds
    @IntoSet
    abstract fun feedStep(impl: ArrivalFeedPreloadStep): ArrivalPreloadStep
}
