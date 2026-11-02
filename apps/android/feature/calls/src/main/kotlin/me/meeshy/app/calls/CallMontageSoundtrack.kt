package me.meeshy.app.calls

import kotlin.math.abs

/** Où le multiplexeur range les pistes du film (`MediaMuxer` en production, [F] son format). */
internal interface CallMontageMuxerSink<F> {
    fun addTrack(format: F): Int
    fun start()
    fun write(track: Int, data: ByteArray, ptsUs: Long, flags: Int)
}

/**
 * **LE FILM ET SA VOIX** (#13692, iOS `CallMontageMovieWriter`) : un MP4 ne s'ouvre qu'une fois toutes ses pistes
 * connues, alors les échantillons attendent que l'image ET la voix aient leur format. Une voix qui ne vient pas
 * dans [audioWaitUs] après l'image ne retient pas le film : il part muet, comme iOS sans micro. La voix d'avant
 * la première image et celle qui reculerait sont écartées (iOS ne pose rien avant le début de session).
 */
internal class CallMontageMux<F>(
    private val sink: CallMontageMuxerSink<F>,
    private val expectsAudio: Boolean,
    private val audioWaitUs: Long = AUDIO_WAIT_US,
) {
    private class Pending(val audio: Boolean, val data: ByteArray, val ptsUs: Long, val flags: Int)

    private var videoFormat: F? = null
    private var audioFormat: F? = null
    private var videoFormatAtUs = 0L
    private var started = false
    private var videoTrack = -1
    private var audioTrack = -1
    private var firstVideoUs: Long? = null
    private var lastAudioUs = Long.MIN_VALUE
    private val pending = ArrayList<Pending>()

    var videoSamples = 0
        private set

    val carriesAudio: Boolean get() = audioTrack >= 0

    fun videoFormat(format: F, nowUs: Long) {
        if (videoFormat != null || started) return
        videoFormat = format
        videoFormatAtUs = nowUs
        startIfReady(nowUs)
    }

    fun audioFormat(format: F, nowUs: Long) {
        if (audioFormat != null || started) return
        audioFormat = format
        startIfReady(nowUs)
    }

    fun video(data: ByteArray, ptsUs: Long, flags: Int, nowUs: Long) {
        if (firstVideoUs == null) firstVideoUs = ptsUs
        place(Pending(audio = false, data = data, ptsUs = ptsUs, flags = flags))
        startIfReady(nowUs)
    }

    fun audio(data: ByteArray, ptsUs: Long, flags: Int, nowUs: Long) {
        place(Pending(audio = true, data = data, ptsUs = ptsUs, flags = flags))
        startIfReady(nowUs)
    }

    /** Le film se ferme : ce qui attendait encore la voix s'écrit, s'il y a au moins une image. */
    fun flush() {
        if (!started && videoFormat != null && firstVideoUs != null) open()
    }

    private fun place(sample: Pending) {
        if (started) return write(sample)
        if (pending.size < MAX_PENDING) pending += sample
    }

    private fun startIfReady(nowUs: Long) {
        if (started || videoFormat == null || firstVideoUs == null) return
        val voiceReady = !expectsAudio || audioFormat != null
        if (voiceReady || nowUs - videoFormatAtUs >= audioWaitUs) open()
    }

    private fun open() {
        videoTrack = sink.addTrack(checkNotNull(videoFormat))
        audioTrack = audioFormat?.takeIf { expectsAudio }?.let(sink::addTrack) ?: -1
        sink.start()
        started = true
        pending.forEach(::write)
        pending.clear()
    }

    private fun write(sample: Pending) {
        if (!sample.audio) {
            sink.write(videoTrack, sample.data, sample.ptsUs, sample.flags)
            videoSamples += 1
            return
        }
        val first = firstVideoUs ?: return
        if (audioTrack < 0 || sample.ptsUs < first || sample.ptsUs <= lastAudioUs) return
        sink.write(audioTrack, sample.data, sample.ptsUs, sample.flags)
        lastAudioUs = sample.ptsUs
    }

    companion object {
        const val AUDIO_WAIT_US = 1_000_000L
        private const val MAX_PENDING = 512
    }
}

/**
 * L'horloge de la voix : WebRTC rend chaque tampon du micro dès qu'il est enregistré, alors son début est son
 * arrivée moins sa durée, sur l'horloge monotone que la surface de l'encodeur donne aux images. Les tampons
 * suivants se datent au compte des échantillons (aucune gigue d'arrivée dans le film) ; un trou ou un retard
 * de plus de [RESYNC_US] recale sur l'horloge. Un format qui change en cours de film est écarté : l'encodeur
 * AAC est configuré une fois.
 */
internal class CallMontageAudioTimeline {
    private var sampleRate = 0
    private var channelCount = 0
    private var anchorUs = 0L
    private var framesSinceAnchor = 0L

    fun stamp(byteCount: Int, sampleRate: Int, channelCount: Int, arrivalUs: Long): Long? {
        if (byteCount <= 0 || sampleRate <= 0 || channelCount <= 0) return null
        if (this.sampleRate != 0 && (sampleRate != this.sampleRate || channelCount != this.channelCount)) return null
        val frames = byteCount / (BYTES_PER_SAMPLE * channelCount).toLong()
        val heardFromUs = arrivalUs - frames * MICROS_PER_SECOND / sampleRate
        if (this.sampleRate == 0) {
            this.sampleRate = sampleRate
            this.channelCount = channelCount
            reanchor(heardFromUs)
        }
        val countedUs = anchorUs + framesSinceAnchor * MICROS_PER_SECOND / sampleRate
        val startUs = if (abs(heardFromUs - countedUs) > RESYNC_US) reanchor(heardFromUs) else countedUs
        framesSinceAnchor += frames
        return startUs
    }

    private fun reanchor(atUs: Long): Long {
        anchorUs = atUs
        framesSinceAnchor = 0
        return atUs
    }

    companion object {
        const val RESYNC_US = 150_000L
        private const val BYTES_PER_SAMPLE = 2
        private const val MICROS_PER_SECOND = 1_000_000L
    }
}
