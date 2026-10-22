package me.meeshy.app.push.media

import android.content.Context
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import me.meeshy.app.BuildConfig
import me.meeshy.sdk.net.ClientCapabilitiesInterceptor
import me.meeshy.sdk.net.DeviceLocaleInterceptor
import okhttp3.OkHttpClient
import java.io.File
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
internal object PushMediaModule {

    @Provides
    @Singleton
    fun providesPushMediaFetcher(@ApplicationContext context: Context): PushMediaFetcher {
        val client = OkHttpClient.Builder()
            .followRedirects(false)
            .followSslRedirects(false)
            .addInterceptor(ClientCapabilitiesInterceptor())
            .addInterceptor(DeviceLocaleInterceptor())
            .addInterceptor { chain ->
                chain.proceed(
                    chain.request().newBuilder()
                        .header("User-Agent", "Meeshy-Android/${BuildConfig.VERSION_NAME}")
                        .header("X-App-Platform", "android")
                        .header("X-App-Version", BuildConfig.VERSION_NAME)
                        .build(),
                )
            }
            .build()
        val dir = File(context.cacheDir, "push-media").apply { mkdirs() }
        return PushMediaFetcher(client, dir)
    }
}
