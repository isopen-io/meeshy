package me.meeshy.sdk.net

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton
import me.meeshy.core.datastore.TokenVault
import me.meeshy.sdk.model.security.SecureStore

@Module
@InstallIn(SingletonComponent::class)
internal object VisitorReaderKeyModule {

    @Provides
    @Singleton
    fun providesVisitorReaderKey(@TokenVault store: SecureStore): VisitorReaderKeyProviding = VisitorReaderKey(store)
}
