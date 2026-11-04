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

/**
 * Vault of the `meeshy.db` SQLCipher key (`meeshy_database_key`). Its own file, recreated only after a durable failure
 * proven over several launches ([DurableFailureGate]): a transient Keystore failure must never cost the database.
 */
@Qualifier
@Retention(AnnotationRetention.BINARY)
annotation class DatabaseKeyVault

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

    @Provides
    @Singleton
    @DatabaseKeyVault
    fun providesDatabaseKeyVault(@ApplicationContext context: Context): SecureStore =
        KeystoreSecureStore.create(context, DATABASE_KEY_VAULT) { app ->
            DurableFailureGate(ledger = { app.getSharedPreferences("$DATABASE_KEY_VAULT.failures", Context.MODE_PRIVATE) })
        }

    private const val DATABASE_KEY_VAULT = "meeshy_database_key"
}
