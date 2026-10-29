package me.meeshy.sdk.user

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import me.meeshy.sdk.session.PerAccountCache

/** Les comptes rapprochés d'une carte de visite sont vidés avec le compte qui les a résolus (#13495, #13560). */
@Module
@InstallIn(SingletonComponent::class)
internal abstract class ContactCardAccountCacheModule {
    @Binds
    @IntoSet
    abstract fun bindContactCardAccounts(resolver: ContactCardAccountResolver): PerAccountCache
}
