package me.meeshy.sdk.call

import kotlinx.coroutines.flow.Flow
import me.meeshy.sdk.model.call.CallRecordingKind
import me.meeshy.sdk.model.call.CallRecordingSocketEvent
import java.io.File

/** Ce que le contrôleur lit de l'appel en cours. */
interface CallRecordingHost {
    /** L'appel actif, ou `null` : toute diffusion d'un autre appel est ignorée. */
    val recordingCallId: String?

    /** L'appel est établi : avant, il n'y a personne à qui demander l'accord. */
    val isEstablished: Boolean

    val conversationId: String?
}

/** Les verbes socket de l'enregistrement et leurs diffusions. La passerelle est l'autorité. */
interface CallRecordingSignals {
    val events: Flow<CallRecordingSocketEvent>

    suspend fun request(callId: String, kind: CallRecordingKind): Result<String>

    suspend fun answer(callId: String, recordingId: String, accepted: Boolean): Result<Unit>

    suspend fun stop(callId: String, recordingId: String): Result<Unit>
}

/** Qui est le lecteur : seule la diffusion qui le nomme enregistreur allume la capture. */
fun interface CallRecordingViewer {
    fun id(): String?
}

/** La capture de l'appel chez l'enregistreur. Absente ([isAvailable] faux) : le bouton Enregistrer n'est pas proposé. */
interface CallRecordingCapturer {
    val isAvailable: Boolean

    fun start(file: File, kind: CallRecordingKind): Boolean

    /** Arrête et rend le fichier capté, ou `null` s'il n'y a rien. */
    fun stop(): File?
}

/** Dépose le fichier capté et rend l'identifiant de la pièce jointe. */
interface CallRecordingUploader {
    suspend fun upload(file: File, mimeType: String): Result<String>
}

/** La conversation de l'appel est-elle chiffrée de bout en bout ? Inconnue vaut non : la passerelle reste l'autorité. */
interface CallRecordingEncryptionGate {
    suspend fun isEndToEnd(conversationId: String?): Boolean
}

internal object UnavailableCallRecordingCapturer : CallRecordingCapturer {
    override val isAvailable: Boolean = false
    override fun start(file: File, kind: CallRecordingKind): Boolean = false
    override fun stop(): File? = null
}

internal object UnavailableCallRecordingUploader : CallRecordingUploader {
    override suspend fun upload(file: File, mimeType: String): Result<String> =
        Result.failure(IllegalStateException("call recording upload unavailable"))
}
