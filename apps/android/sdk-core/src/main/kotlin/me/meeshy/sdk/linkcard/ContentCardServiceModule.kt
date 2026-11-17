package me.meeshy.sdk.linkcard

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import me.meeshy.sdk.session.PerAccountCache

/** Lot carte-de-contenu-19333 : la mémoire des cartes de contenu s'oublie au changement de compte. */
@Module
@InstallIn(SingletonComponent::class)
internal abstract class ContentCardServiceModule {
    @Binds
    @IntoSet
    abstract fun bindContentCardService(service: ContentCardService): PerAccountCache
}
