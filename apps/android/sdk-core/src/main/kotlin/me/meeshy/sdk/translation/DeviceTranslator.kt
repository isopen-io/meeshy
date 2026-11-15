package me.meeshy.sdk.translation

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Inject
import javax.inject.Singleton
import me.meeshy.sdk.model.translation.DeviceTranslationPair
import me.meeshy.sdk.translation.device.DeviceTranslationAvailability
import me.meeshy.sdk.translation.device.DeviceTranslationEngine
import me.meeshy.sdk.translation.device.DeviceTranslationRequest

/**
 * Le port par lequel un message que le serveur ne lit pas est traduit : sur l'appareil, jamais par le
 * serveur ([me.meeshy.sdk.model.translation.ServerTranslationAdmission]). `null` = non traduit
 * (couple non pris en charge, modèles à télécharger, texte vide) ; l'appelant garde l'original.
 * Rien n'est écrit sur le disque ici : le texte d'un message chiffré reste éphémère.
 */
interface DeviceTranslator {
    suspend fun translate(text: String, sourceLanguage: String, targetLanguage: String): String?
}

@Singleton
class EngineDeviceTranslator @Inject constructor(
    private val engine: DeviceTranslationEngine,
) : DeviceTranslator {
    override suspend fun translate(text: String, sourceLanguage: String, targetLanguage: String): String? {
        val pair = DeviceTranslationPair(sourceLanguage.trim().lowercase(), targetLanguage.trim().lowercase())
        if (text.isBlank() || pair.source.isEmpty() || pair.target.isEmpty() || pair.source == pair.target) return null
        if (engine.availability(pair) != DeviceTranslationAvailability.READY) return null
        return engine.translate(listOf(DeviceTranslationRequest(ID, text)), pair)
            .firstOrNull { it.id == ID }?.text?.takeIf { it.isNotBlank() }
    }

    private companion object {
        const val ID = "t"
    }
}

@Module
@InstallIn(SingletonComponent::class)
abstract class DeviceTranslatorModule {
    @Binds
    abstract fun deviceTranslator(impl: EngineDeviceTranslator): DeviceTranslator
}
