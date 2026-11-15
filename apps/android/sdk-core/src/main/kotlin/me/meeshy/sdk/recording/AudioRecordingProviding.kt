package me.meeshy.sdk.recording

import java.io.File
import me.meeshy.sdk.model.waveform.VoiceRecordingSession

/** Une prise terminée : son fichier, sa durée, les niveaux de l'onde de toute la prise et son type MIME. */
public data class AudioRecordingResult(
    val file: File,
    val durationSeconds: Double,
    val levels: List<Float>,
    val mimeType: String,
)

/**
 * L'enregistreur unique des vocaux (iOS `AudioRecordingProviding`) : le composeur de conversation, celui
 * du fil et la voix des stories n'ouvrent plus chacun leur `MediaRecorder`. L'état de la pilule
 * ([session]) et le micro avancent ensemble ; tout appel se fait sur le fil principal.
 */
public interface AudioRecordingProviding {
    public val session: VoiceRecordingSession

    /** Ouvre le micro ; [onStarted] dit si la prise tourne vraiment (refus du micro, appel en cours : `false`). */
    public fun start(onStarted: (Boolean) -> Unit = {})

    public fun tick(deltaSeconds: Double)

    /** Termine la prise : `null` si elle est trop courte (fichier supprimé). */
    public fun finish(onResult: (AudioRecordingResult?) -> Unit = {})

    public fun cancel()

    /** Sortie de l'écran : le micro est rendu, une prise assez longue est remise. */
    public fun abandon(onResult: (AudioRecordingResult?) -> Unit = {})

    /** Appelé quand un appel arrête la prise : la prise captée est CONSERVÉE et remise ici. */
    public var onInterrupted: ((AudioRecordingResult?) -> Unit)?
}
