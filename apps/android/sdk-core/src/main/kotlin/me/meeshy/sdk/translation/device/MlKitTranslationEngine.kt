package me.meeshy.sdk.translation.device

import com.google.android.gms.tasks.Task
import com.google.mlkit.common.model.DownloadConditions
import com.google.mlkit.common.model.RemoteModelManager
import com.google.mlkit.nl.translate.TranslateLanguage
import com.google.mlkit.nl.translate.TranslateRemoteModel
import com.google.mlkit.nl.translate.Translation
import com.google.mlkit.nl.translate.Translator
import com.google.mlkit.nl.translate.TranslatorOptions
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import me.meeshy.sdk.model.translation.DeviceTranslationPair
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.coroutines.resume

/**
 * Le moteur ML Kit Translate. Un travail à la fois (file série), codes à 2 lettres, modèles
 * téléchargés sous [DownloadConditions] (Wi-Fi par défaut) après une demande unique par couple et
 * par session ([DownloadConsentPolicy]). Toute panne (dont l'absence de Play Services) rend le
 * couple non supporté, sans erreur visible.
 */
@Singleton
class MlKitTranslationEngine @Inject constructor(
    private val prompter: DeviceTranslationDownloadPrompter,
) : DeviceTranslationEngine {

    override val engineName: String = "mlkit-translate"

    private val consent = DownloadConsentPolicy()
    private val queue = Mutex()
    private val translators = mutableMapOf<DeviceTranslationPair, Translator>()

    @Volatile private var generation = 0

    override suspend fun availability(pair: DeviceTranslationPair): DeviceTranslationAvailability {
        val (source, target) = mlKitPair(pair) ?: return DeviceTranslationAvailability.UNSUPPORTED
        if (consent.isBlocked(pair)) return DeviceTranslationAvailability.UNSUPPORTED
        return try {
            if (isDownloaded(source) && isDownloaded(target)) {
                DeviceTranslationAvailability.READY
            } else {
                DeviceTranslationAvailability.NEEDS_DOWNLOAD
            }
        } catch (e: CancellationException) {
            throw e
        } catch (_: Throwable) {
            DeviceTranslationAvailability.UNSUPPORTED
        }
    }

    override suspend fun translate(
        requests: List<DeviceTranslationRequest>,
        pair: DeviceTranslationPair,
    ): List<DeviceTranslationResult> {
        if (requests.isEmpty()) return emptyList()
        val (source, target) = mlKitPair(pair) ?: return emptyList()
        val startedAt = generation
        return queue.withLock {
            try {
                if (startedAt != generation || consent.isBlocked(pair)) return@withLock emptyList()
                if (!ensureModels(pair, source, target)) return@withLock emptyList()
                val translator = translatorFor(pair, source, target)
                requests.mapNotNull { request ->
                    if (startedAt != generation) return@mapNotNull null
                    val text = runCatchingTask { translator.translate(request.text) }
                    text?.takeIf { it.isNotBlank() }?.let { DeviceTranslationResult(request.id, it) }
                }
            } catch (e: CancellationException) {
                throw e
            } catch (_: Throwable) {
                consent.remember(pair)
                emptyList()
            }
        }
    }

    override fun cancelPending() {
        generation++
    }

    private suspend fun ensureModels(pair: DeviceTranslationPair, source: String, target: String): Boolean {
        if (isDownloaded(source) && isDownloaded(target)) return true
        if (!consent.shouldAsk(pair)) return false
        val decision = prompter.ask(
            DeviceTranslationDownloadRequest(pair, APPROXIMATE_MODEL_SIZE_MB, wifiOnly = true),
        )
        if (decision !is DeviceTranslationDownloadDecision.Accepted) {
            consent.remember(pair)
            return false
        }
        val conditions = DownloadConditions.Builder()
            .apply { if (decision.wifiOnly) requireWifi() }
            .build()
        val downloaded = try {
            translatorFor(pair, source, target).downloadModelIfNeeded(conditions).awaitSuccess()
        } catch (e: CancellationException) {
            throw e
        } catch (_: Throwable) {
            false
        }
        if (!downloaded) {
            consent.remember(pair)
            return false
        }
        return true
    }

    private fun translatorFor(pair: DeviceTranslationPair, source: String, target: String): Translator =
        translators.getOrPut(pair) {
            Translation.getClient(
                TranslatorOptions.Builder().setSourceLanguage(source).setTargetLanguage(target).build(),
            )
        }

    private suspend fun isDownloaded(mlKitCode: String): Boolean {
        val language = TranslateLanguage.fromLanguageTag(mlKitCode) ?: return false
        if (language == TranslateLanguage.ENGLISH) return true
        val models = runCatchingTask {
            RemoteModelManager.getInstance().getDownloadedModels(TranslateRemoteModel::class.java)
        } ?: return false
        return models.any { it.language == language }
    }

    private fun mlKitPair(pair: DeviceTranslationPair): Pair<String, String>? {
        val source = MlKitLanguageCodeMapping.toMlKit(pair.source) ?: return null
        val target = MlKitLanguageCodeMapping.toMlKit(pair.target) ?: return null
        return (source to target).takeIf { source != target }
    }

    private suspend fun <T> runCatchingTask(block: () -> Task<T>): T? =
        try {
            block().await()
        } catch (e: CancellationException) {
            throw e
        } catch (_: Throwable) {
            null
        }

    private companion object {
        const val APPROXIMATE_MODEL_SIZE_MB = 30
    }
}

internal suspend fun <T> Task<T>.await(): T? = suspendCancellableCoroutine { cont ->
    addOnSuccessListener { if (cont.isActive) cont.resume(it) }
    addOnFailureListener { if (cont.isActive) cont.resume(null) }
    addOnCanceledListener { if (cont.isActive) cont.resume(null) }
}

internal suspend fun Task<*>.awaitSuccess(): Boolean = suspendCancellableCoroutine { cont ->
    addOnSuccessListener { if (cont.isActive) cont.resume(true) }
    addOnFailureListener { if (cont.isActive) cont.resume(false) }
    addOnCanceledListener { if (cont.isActive) cont.resume(false) }
}
