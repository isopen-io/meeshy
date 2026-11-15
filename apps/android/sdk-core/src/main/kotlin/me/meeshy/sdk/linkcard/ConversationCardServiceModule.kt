package me.meeshy.sdk.linkcard

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import me.meeshy.sdk.session.PerAccountCache

@Module
@InstallIn(SingletonComponent::class)
internal abstract class ConversationCardServiceModule {
    @Binds
    @IntoSet
    abstract fun bindCardService(service: ConversationCardService): PerAccountCache
}
