package me.meeshy.sdk.di

import android.content.Context
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.datastore.preferences.preferencesDataStoreFile
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.serialization.json.Json
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.cache.SystemCacheClock
import me.meeshy.sdk.chat.ConversationDraftStore
import me.meeshy.sdk.chat.DataStoreConversationDraftStore
import me.meeshy.sdk.chat.LocallyHiddenMessagesStore
import me.meeshy.sdk.chat.SharedPrefsLocallyHiddenMessagesStore
import me.meeshy.sdk.chat.SharedPrefsStarredMessagesStore
import me.meeshy.sdk.chat.StarredMessagesStore
import me.meeshy.sdk.language.DataStoreInterfaceLanguageStore
import me.meeshy.sdk.language.InterfaceLanguageStore
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.media.AndroidNetworkConditionMonitor
import me.meeshy.sdk.media.DataStoreMediaDownloadPreferencesStore
import me.meeshy.sdk.media.MediaDownloadPreferencesStore
import me.meeshy.sdk.media.NetworkConditionMonitor
import me.meeshy.sdk.notification.DataStoreNotificationPreferencesStore
import me.meeshy.sdk.notification.NotificationPreferencesStore
import me.meeshy.sdk.privacy.DataStorePrivacyPreferencesStore
import me.meeshy.sdk.privacy.PrivacyPreferencesStore
import me.meeshy.sdk.reaction.EmojiUsageStore
import me.meeshy.sdk.reaction.SharedPrefsEmojiUsageStore
import me.meeshy.sdk.theme.DataStoreThemeStore
import me.meeshy.sdk.theme.ThemeStore
import javax.inject.Singleton

/**
 * Hilt bindings for sdk-core dependencies not covered by NetworkModule
 * (ARCHITECTURE.md §2).
 *
 * The [Json] instance mirrors [MeeshyApi.json] so socket payloads and REST
 * responses share the same lenient deserialization settings.
 */
@Module
@InstallIn(SingletonComponent::class)
object SdkModule {

    @Provides
    @Singleton
    fun providesCacheClock(): CacheClock = SystemCacheClock

    @Provides
    @Singleton
    fun providesEmojiUsageStore(@ApplicationContext context: Context): EmojiUsageStore =
        SharedPrefsEmojiUsageStore(context)

    @Provides
    @Singleton
    fun providesLocallyHiddenMessagesStore(
        @ApplicationContext context: Context,
    ): LocallyHiddenMessagesStore = SharedPrefsLocallyHiddenMessagesStore(context)

    @Provides
    @Singleton
    fun providesStarredMessagesStore(
        @ApplicationContext context: Context,
        json: Json,
    ): StarredMessagesStore = SharedPrefsStarredMessagesStore(context, json)

    @Provides
    @Singleton
    fun providesThemeStore(@ApplicationContext context: Context): ThemeStore {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        val dataStore = PreferenceDataStoreFactory.create(scope = scope) {
            context.preferencesDataStoreFile("meeshy_theme")
        }
        return DataStoreThemeStore(dataStore, scope)
    }

    @Provides
    @Singleton
    fun providesInterfaceLanguageStore(@ApplicationContext context: Context): InterfaceLanguageStore {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        val dataStore = PreferenceDataStoreFactory.create(scope = scope) {
            context.preferencesDataStoreFile("meeshy_language")
        }
        return DataStoreInterfaceLanguageStore(dataStore, scope)
    }

    @Provides
    @Singleton
    fun providesNotificationPreferencesStore(@ApplicationContext context: Context): NotificationPreferencesStore {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        val dataStore = PreferenceDataStoreFactory.create(scope = scope) {
            context.preferencesDataStoreFile("meeshy_notifications")
        }
        return DataStoreNotificationPreferencesStore(dataStore, scope)
    }

    @Provides
    @Singleton
    fun providesMediaDownloadPreferencesStore(@ApplicationContext context: Context): MediaDownloadPreferencesStore {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        val dataStore = PreferenceDataStoreFactory.create(scope = scope) {
            context.preferencesDataStoreFile("meeshy_media_download")
        }
        return DataStoreMediaDownloadPreferencesStore(dataStore, scope)
    }

    @Provides
    @Singleton
    fun providesNetworkConditionMonitor(@ApplicationContext context: Context): NetworkConditionMonitor {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        return AndroidNetworkConditionMonitor(context, scope)
    }

    @Provides
    @Singleton
    fun providesPrivacyPreferencesStore(@ApplicationContext context: Context): PrivacyPreferencesStore {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        val dataStore = PreferenceDataStoreFactory.create(scope = scope) {
            context.preferencesDataStoreFile("meeshy_privacy")
        }
        return DataStorePrivacyPreferencesStore(dataStore, scope)
    }

    @Provides
    @Singleton
    fun providesConversationDraftStore(
        @ApplicationContext context: Context,
        json: Json,
    ): ConversationDraftStore {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        val dataStore = PreferenceDataStoreFactory.create(scope = scope) {
            context.preferencesDataStoreFile("meeshy_conversation_drafts")
        }
        return DataStoreConversationDraftStore(dataStore, json)
    }

    @Provides
    @Singleton
    fun providesJson(): Json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        explicitNulls = false
        coerceInputValues = true
    }
}
