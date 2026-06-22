package me.meeshy.sdk.di

import android.content.Context
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import kotlinx.serialization.json.Json
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.cache.SystemCacheClock
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.reaction.EmojiUsageStore
import me.meeshy.sdk.reaction.SharedPrefsEmojiUsageStore
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
    fun providesJson(): Json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        explicitNulls = false
        coerceInputValues = true
    }
}
