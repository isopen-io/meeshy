package me.meeshy.core.datastore

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import me.meeshy.sdk.model.security.SecureStore
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object BlobCodecModule {

    @Provides
    @Singleton
    fun providesBlobCodec(@SecretVault vault: SecureStore): BlobCodec =
        EncryptedBlobCodec(VaultBlobKeySource(vault))
}
