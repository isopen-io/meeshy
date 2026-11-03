package me.meeshy.sdk.call

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.merge
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeoutOrNull
import me.meeshy.sdk.model.call.CallRecordingTapFormat
import java.io.File

/**
 * L'enregistrement AUDIO d'un appel (#14553) : les tampons que WebRTC enregistre déjà ([microphone]) et joue
 * déjà ([remote]) sont mélangés par [CallAudioMixer] puis encodés en M4A AAC. Aucun second `AudioRecord` : il
 * couperait l'appel ou n'entendrait que du silence. Le format du tap est vérifié AVANT d'ouvrir le fichier (le
 * premier tampon du micro le donne ; un format illisible n'ouvre rien et l'arrêt ne rend aucun fichier), et le
 * fichier prend le taux du micro. Une seule file : les deux sources sont fusionnées dans UNE collecte, le
 * mélangeur n'est jamais touché par deux threads.
 */
internal class CallAudioRecorder(
    private val microphone: Flow<CallPcmFrame>,
    private val remote: Flow<CallPcmFrame>,
    private val writerFactory: () -> CallAacFileWriter,
    private val scope: CoroutineScope,
) {
    private var job: Job? = null
    private var file: File? = null
    private var writer: CallAacFileWriter? = null
    private var mixer: CallAudioMixer? = null

    @Volatile
    private var failed = false

    fun start(target: File): Boolean {
        if (job != null) return false
        file = target
        failed = false
        job = scope.launch {
            try {
                merge(
                    microphone.map { CallAudioSource.Local to it },
                    remote.map { CallAudioSource.Remote to it },
                ).collect { (source, frame) -> if (!accept(source, frame)) throw StopCollecting() }
            } catch (stop: StopCollecting) {
                failed = true
            }
        }
        return true
    }

    /** Arrête, vide le mélangeur, finalise le fichier. `null` : rien n'a été capté (ou le format était illisible). */
    fun stop(): File? {
        val running = job ?: return null
        job = null
        running.cancel()
        runBlocking { withTimeoutOrNull(JOIN_TIMEOUT_MS) { running.join() } }
        val target = file
        val open = writer
        val pending = mixer
        file = null
        writer = null
        mixer = null
        if (open == null || pending == null || target == null || failed) {
            open?.close()
            target?.delete()
            return null
        }
        val tail = pending.flush()
        if (tail.isNotEmpty()) open.write(tail)
        if (open.close()) return target
        target.delete()
        return null
    }

    private fun accept(source: CallAudioSource, frame: CallPcmFrame): Boolean {
        val current = mixer ?: run {
            if (source != CallAudioSource.Local) return true
            open(frame) ?: return false
        }
        current.push(source, frame)
        val mixed = current.drain()
        if (mixed.isNotEmpty()) writer?.write(mixed)
        return true
    }

    private fun open(first: CallPcmFrame): CallAudioMixer? {
        val target = file ?: return null
        if (!CallRecordingTapFormat.mayCapture(first.sampleRate, first.channelCount)) return null
        val opened = writerFactory()
        if (!opened.open(target, first.sampleRate)) return null
        writer = opened
        return CallAudioMixer(first.sampleRate).also { mixer = it }
    }

    private class StopCollecting : RuntimeException("recording cannot start")

    private companion object {
        const val JOIN_TIMEOUT_MS = 2_000L
    }
}
