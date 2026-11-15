package me.meeshy.sdk.model.relation

/** Un fragment prêt à partir : ses trames ADTS bout à bout, leur durée (ms), l'instant de capture de la première. */
public class TalkieFragment(public val data: ByteArray, public val durationMs: Double, public val capturedAtMs: Long) {
    override fun equals(other: Any?): Boolean = other is TalkieFragment &&
        data.contentEquals(other.data) && durationMs == other.durationMs && capturedAtMs == other.capturedAtMs

    override fun hashCode(): Int = listOf(data.contentHashCode(), durationMs, capturedAtMs).hashCode()
}

/**
 * Le découpage en fragments (#17150, iso `TalkieFragmenter` du SDK iOS) : chaque trame rejoint le fragment courant ; il
 * part dès qu'il atteint sa durée, et AVANT qu'une trame ne lui fasse dépasser le plafond d'octets. L'état est privé à
 * une prise de parole : un fragmenteur ne sert qu'une fois.
 */
public class TalkieFragmenter(
    public var maxChunkBytes: Int = TalkieContract.MAX_CHUNK_BYTES,
    private val fragmentDurationMs: Double = TalkieContract.FRAGMENT_DURATION_MS.toDouble(),
) {
    private var frames: List<ByteArray> = emptyList()
    private var bytes = 0
    private var durationMs = 0.0
    private var capturedAtMs: Long? = null

    /** Les fragments complétés par cette trame, dans l'ordre (zéro, un ou deux). */
    public fun append(frame: ByteArray, frameDurationMs: Double, atMs: Long): List<TalkieFragment> {
        if (frame.isEmpty()) return emptyList()
        val beforeFull = if (bytes > 0 && bytes + frame.size > maxChunkBytes) flush() else null
        if (bytes == 0) capturedAtMs = atMs
        frames = frames + frame
        bytes += frame.size
        durationMs += frameDurationMs
        val full = if (durationMs >= fragmentDurationMs) flush() else null
        return listOfNotNull(beforeFull, full)
    }

    /** Ce qui reste : le fragment courant, même incomplet. */
    public fun flush(): TalkieFragment? {
        val at = capturedAtMs
        if (bytes == 0 || at == null) return null
        val fragment = TalkieFragment(frames.fold(ByteArray(0)) { acc, next -> acc + next }, durationMs, at)
        frames = emptyList()
        bytes = 0
        durationMs = 0.0
        capturedAtMs = null
        return fragment
    }
}

/**
 * Les plafonds d'une prise de parole entière : un fragment admis reçoit son `seq` ; au-delà, l'émetteur ferme AVANT que
 * la passerelle ne coupe.
 */
public class TalkieBudget(
    private val maxTotalBytes: Int = TalkieContract.MAX_TOTAL_BYTES,
    private val maxChunks: Int = TalkieContract.MAX_CHUNKS,
) {
    private var nextSeq = 0
    private var sentBytes = 0

    /** Le `seq` du fragment admis, ou `null` s'il ferait dépasser un plafond. */
    public fun admit(bytes: Int): Int? {
        if (nextSeq + 1 > maxChunks || sentBytes + bytes > maxTotalBytes) return null
        val seq = nextSeq
        nextSeq += 1
        sentBytes += bytes
        return seq
    }
}

/** Les étapes mesurées d'une prise de parole (#17094), comptées depuis l'appui. */
public enum class TalkieLatencyStep(public val label: String) {
    MIC_READY("micro"),
    OPENED("accusé"),
    FIRST_CHUNK("premier fragment"),
}

/** Les temps d'une prise de parole : la première marque d'une étape compte ; un instant antérieur à l'appui vaut zéro. */
public data class TalkieLatency(val pressedAtMs: Long, val marks: Map<TalkieLatencyStep, Long> = emptyMap()) {
    public fun marked(step: TalkieLatencyStep, atMs: Long): TalkieLatency =
        if (step in marks) this else copy(marks = marks + (step to (atMs - pressedAtMs).coerceAtLeast(0L)))

    /** `micro 312 ms · accusé 140 ms · premier fragment 455 ms` — une étape non atteinte se lit `—`. */
    val summary: String
        get() = TalkieLatencyStep.entries.joinToString(" · ") { step ->
            "${step.label} ${marks[step]?.let { "$it ms" } ?: "—"}"
        }
}
