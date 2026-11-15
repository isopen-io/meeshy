package me.meeshy.sdk.call

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import me.meeshy.sdk.session.PerAccountCache

/** The call journal's searched memory is per account (#13560): [me.meeshy.sdk.session.SessionTeardown] clears it. */
@Module
@InstallIn(SingletonComponent::class)
internal abstract class CallHistoryAccountCacheModule {
    @Binds
    @IntoSet
    abstract fun bindCallHistoryMemory(repository: CallHistoryRepository): PerAccountCache
}
