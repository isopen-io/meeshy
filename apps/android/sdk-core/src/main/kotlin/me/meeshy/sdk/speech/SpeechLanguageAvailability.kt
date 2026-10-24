package me.meeshy.sdk.speech

import android.content.Context
import android.content.Intent
import android.os.Build
import android.speech.RecognitionSupport
import android.speech.RecognitionSupportCallback
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import androidx.annotation.RequiresApi
import androidx.core.content.ContextCompat
import kotlinx.coroutines.suspendCancellableCoroutine
import me.meeshy.sdk.model.speech.OnDeviceLanguageMatch
import java.util.Locale
import kotlin.coroutines.resume

/** Ce que l'appareil sait faire pour une langue demandée. */
public sealed interface SpeechLanguageResolution {
    /** Le modèle de [tag] est installé : la transcription locale est possible. */
    public data class Available(val tag: String) : SpeechLanguageResolution

    /** La plateforme sait transcrire localement mais pas cette langue (modèle absent). */
    public data object NotInstalled : SpeechLanguageResolution

    /** API < 33 : aucune transcription locale, la transcription serveur prend le relais (pas une erreur). */
    public data object ServerFallback : SpeechLanguageResolution
}

/** Les langues dont le modèle de reconnaissance est installé sur l'appareil. */
public fun interface InstalledSpeechLanguages {
    public suspend fun installed(): Set<String>
}

/**
 * Langues de reconnaissance sur appareil disponibles. `checkRecognitionSupport` n'existe qu'à
 * partir de l'API 33 : en dessous, aucune langue n'est annoncée et l'appelant retombe sur le
 * serveur, sans erreur.
 */
public class SpeechLanguageAvailability(
    private val source: InstalledSpeechLanguages,
    private val sdkInt: Int = Build.VERSION.SDK_INT,
    private val deviceRegion: () -> String? = { Locale.getDefault().country.ifBlank { null } },
) {
    public val supportsLocalTranscription: Boolean get() = sdkInt >= MIN_SDK_LANGUAGE_LISTING

    public suspend fun installedLanguages(): Set<String> =
        if (supportsLocalTranscription) source.installed() else emptySet()

    public suspend fun resolve(requested: String): SpeechLanguageResolution {
        if (!supportsLocalTranscription) return SpeechLanguageResolution.ServerFallback
        val tag = OnDeviceLanguageMatch.resolve(requested, source.installed(), deviceRegion())
        return if (tag == null) SpeechLanguageResolution.NotInstalled else SpeechLanguageResolution.Available(tag)
    }

    public companion object {
        public const val MIN_SDK_LANGUAGE_LISTING: Int = 33
    }
}

/** Lit les langues installées auprès du reconnaisseur sur appareil (API 33+, thread principal). */
@RequiresApi(Build.VERSION_CODES.TIRAMISU)
public class AndroidInstalledSpeechLanguages(private val context: Context) : InstalledSpeechLanguages {

    override suspend fun installed(): Set<String> {
        if (!SpeechRecognizer.isOnDeviceRecognitionAvailable(context)) return emptySet()
        return suspendCancellableCoroutine { continuation ->
            val recognizer = SpeechRecognizer.createOnDeviceSpeechRecognizer(context)
            val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
                .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            val finish: (Set<String>) -> Unit = { languages ->
                recognizer.destroy()
                if (continuation.isActive) continuation.resume(languages)
            }
            continuation.invokeOnCancellation { recognizer.destroy() }
            recognizer.checkRecognitionSupport(
                intent,
                ContextCompat.getMainExecutor(context),
                object : RecognitionSupportCallback {
                    override fun onSupportResult(recognitionSupport: RecognitionSupport) {
                        finish(recognitionSupport.installedOnDeviceLanguages.toSet())
                    }

                    override fun onError(error: Int) {
                        finish(emptySet())
                    }
                },
            )
        }
    }
}
