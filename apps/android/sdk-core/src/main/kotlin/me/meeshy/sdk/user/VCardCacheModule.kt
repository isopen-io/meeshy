package me.meeshy.sdk.user

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import me.meeshy.sdk.session.PerAccountCache

/** Les cartes lues (noms, numéros, e-mails d'un tiers) sont vidées avec le compte qui les a reçues (#13495). */
@Module
@InstallIn(SingletonComponent::class)
internal abstract class VCardCacheModule {
    @Binds
    @IntoSet
    abstract fun bindVCardCache(cache: VCardCache): PerAccountCache
}
