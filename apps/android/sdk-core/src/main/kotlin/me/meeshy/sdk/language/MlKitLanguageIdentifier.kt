package me.meeshy.sdk.language

import com.google.mlkit.nl.languageid.LanguageIdentification
import com.google.mlkit.nl.languageid.LanguageIdentificationOptions
import kotlinx.coroutines.CancellationException
import me.meeshy.sdk.lang.LanguageIdentifying
import me.meeshy.sdk.translation.device.await
import javax.inject.Inject
import javax.inject.Singleton
import me.meeshy.sdk.lang.LanguageIdentification as Identification

/**
 * L'identification de langue ML Kit (sur l'appareil). Sans Play Services ou en cas d'échec, rend
 * `null` : l'appelant garde l'heuristique JVM. Le seuil de confiance (0,65) et le minimum de lettres
 * sont posés par `ComposeLanguageDetector`.
 */
@Singleton
class MlKitLanguageIdentifier @Inject constructor() : LanguageIdentifying {

    private val client by lazy {
        LanguageIdentification.getClient(
            LanguageIdentificationOptions.Builder().setConfidenceThreshold(0f).build(),
        )
    }

    override suspend fun identify(text: String): Identification? =
        try {
            client.identifyPossibleLanguages(text).await()
                ?.maxByOrNull { it.confidence }
                ?.let { Identification(it.languageTag, it.confidence.toDouble()) }
        } catch (e: CancellationException) {
            throw e
        } catch (_: Throwable) {
            null
        }
}
