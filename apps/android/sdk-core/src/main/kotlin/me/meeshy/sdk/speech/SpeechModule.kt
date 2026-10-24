package me.meeshy.sdk.speech

import android.content.Context
import android.os.Build
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.Multibinds
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.withContext
import me.meeshy.core.common.MainDispatcher
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
internal abstract class SpeechExtensionsModule {
    /** Le moteur d'appel peut contribuer son arbitrage du micro ; sans lui, le micro est libre. */
    @Multibinds
    abstract fun microphoneClaims(): Set<@JvmSuppressWildcards MicrophoneClaim>
}

@Module
@InstallIn(SingletonComponent::class)
internal object SpeechModule {

    @Provides
    @Singleton
    fun provideOnDeviceSpeechRecognizer(
        @ApplicationContext context: Context,
        @MainDispatcher main: CoroutineDispatcher,
        claims: Set<@JvmSuppressWildcards MicrophoneClaim>,
    ): OnDeviceSpeechRecognizer = AndroidOnDeviceSpeechRecognizer(
        sessions = AndroidRecognizerSessionFactory(context),
        main = main,
        microphonePermitted = context::hasRecordAudioPermission,
        microphoneClaim = MicrophoneClaim { claims.any { it.isHeldByCall() } },
    )

    @Provides
    @Singleton
    fun provideSpeechLanguageAvailability(
        @ApplicationContext context: Context,
        @MainDispatcher main: CoroutineDispatcher,
    ): SpeechLanguageAvailability = SpeechLanguageAvailability(
        source = InstalledSpeechLanguages {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                withContext(main) { AndroidInstalledSpeechLanguages(context).installed() }
            } else {
                emptySet()
            }
        },
    )
}
