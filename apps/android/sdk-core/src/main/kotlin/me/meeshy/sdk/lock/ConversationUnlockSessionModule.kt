package me.meeshy.sdk.lock

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import me.meeshy.sdk.session.PerAccountCache

@Module
@InstallIn(SingletonComponent::class)
internal abstract class ConversationUnlockSessionModule {
    @Binds
    @IntoSet
    abstract fun bindUnlockSession(store: ConversationUnlockSessionStore): PerAccountCache
}
