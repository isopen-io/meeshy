package me.meeshy.sdk.translation.device

import android.content.Context
import dagger.Binds
import dagger.Provides
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Provider
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import me.meeshy.sdk.language.MlKitLanguageIdentifier
import me.meeshy.sdk.lang.LanguageIdentifying
import javax.inject.Singleton

/** Les couplages du moteur de traduction sur l'appareil et de l'identification de langue ML Kit. */
@Module
@InstallIn(SingletonComponent::class)
abstract class DeviceTranslationModule {
    @Binds @Singleton
    abstract fun languageIdentifier(impl: MlKitLanguageIdentifier): LanguageIdentifying

    companion object {
        /** Tant qu'aucune interface ne répond, la demande est déclinée (aucun téléchargement muet). */
        @Provides @Singleton
        fun engine(
            @ApplicationContext context: Context,
            mlKit: Provider<MlKitTranslationEngine>,
        ): DeviceTranslationEngine =
            if (PlayServicesPresence.isInstalled(context)) mlKit.get() else UnavailableDeviceTranslationEngine()

        @Provides @Singleton
        fun prompter(): DeviceTranslationDownloadPrompter = DeviceTranslationDownloadPrompter.Declining
    }
}
