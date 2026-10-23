package me.meeshy.core.datastore

import android.content.Context
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import me.meeshy.sdk.model.security.SecureStore
import javax.inject.Qualifier
import javax.inject.Singleton

/** Vault of the session tokens (`meeshy_secure_tokens`, reopened as is). */
@Qualifier
@Retention(AnnotationRetention.BINARY)
annotation class TokenVault

/** Vault of the conversation lock PINs (`meeshy_conversation_locks`, reopened as is). */
@Qualifier
@Retention(AnnotationRetention.BINARY)
annotation class ConversationLockVault

/** General vault for the secrets of later lots (`meeshy_secure_vault`). */
@Qualifier
@Retention(AnnotationRetention.BINARY)
annotation class SecretVault

@Module
@InstallIn(SingletonComponent::class)
object SecureStoreModule {

    @Provides
    @Singleton
    @TokenVault
    fun providesTokenVault(@ApplicationContext context: Context): SecureStore =
        KeystoreSecureStore.create(context, "meeshy_secure_tokens")

    @Provides
    @Singleton
    @ConversationLockVault
    fun providesConversationLockVault(@ApplicationContext context: Context): SecureStore =
        KeystoreSecureStore.create(context, "meeshy_conversation_locks")

    @Provides
    @Singleton
    @SecretVault
    fun providesSecretVault(@ApplicationContext context: Context): SecureStore =
        KeystoreSecureStore.create(context, "meeshy_secure_vault")
}
