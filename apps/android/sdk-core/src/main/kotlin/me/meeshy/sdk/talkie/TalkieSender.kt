package me.meeshy.sdk.talkie

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.async
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.yield
import me.meeshy.sdk.model.relation.TalkieBudget
import me.meeshy.sdk.model.relation.TalkieContract
import me.meeshy.sdk.model.relation.TalkieDelivery
import me.meeshy.sdk.model.relation.TalkieEndReason
import me.meeshy.sdk.model.relation.TalkieEnded
import me.meeshy.sdk.model.relation.TalkieFragment
import me.meeshy.sdk.model.relation.TalkieFragmenter
import me.meeshy.sdk.model.relation.TalkieLatency
import me.meeshy.sdk.model.relation.TalkieLatencyStep
import me.meeshy.sdk.model.relation.TalkieOpened
import me.meeshy.sdk.model.relation.TalkieSendOutcome
import me.meeshy.sdk.model.relation.TalkieSendPhase
import me.meeshy.sdk.model.relation.TalkieStartVerdict
import timber.log.Timber

/** Ferme une prise de parole passé sa durée maximale. Rend de quoi l'annuler. */
typealias TalkieDeadlineScheduler = (delayMs: Long, run: () -> Unit) -> () -> Unit

/**
 * **ÉMETTRE LE TALKIE DEPUIS ANDROID** (#17150, iso `TalkieSender.swift` et `createTalkieSender` du web). Une instance
 * par écran ; tout tourne sur le fil de [scope] (le fil principal), le micro remettant ses trames sur ce fil.
 *
 * - **Appuyer** ouvre `talkie:start` ET le micro EN MÊME TEMPS : ce qui est capté avant l'accusé est gardé (borné) et
 *   part dès l'ouverture — le premier mot n'est jamais mangé par l'aller-retour. `talkie:start` part AVANT le micro.
 * - Chaque trame rejoint un fragment de ~120 ms ([TalkieFragmenter]) : `talkie:send-chunk`, `seq` croissant
 *   ([TalkieBudget]), `capturedAt`.
 * - **Relâcher** arrête le micro, vide ce qui reste, puis `talkie:end`.
 * - La durée maximale SERVIE ferme seule ; les plafonds d'octets et de fragments aussi, AVANT que le serveur ne coupe.
 * - Un `talkie:ended` qui porte MON `talkieId` arrête le micro, sans `talkie:end`.
 * - **Repli** (`voice`) : le micro continue tant que le doigt tient, puis la voix part en message vocal.
 * - **Réveil** (`delivery: waking`) : l'écran dit « Réveil de X… » ; la voix est gardée jusqu'au verdict `joined` de la
 *   passerelle — `false` la fait partir en copie vocale, même si le verdict arrive avant que le micro ne s'arrête.
 */
class TalkieSender(
    private val emitter: TalkieEmitting,
    private val capture: TalkieCapturing,
    private val copier: TalkieVoiceCopying,
    endedEvents: Flow<TalkieEnded>,
    private val scope: CoroutineScope,
    private val now: () -> Long = System::currentTimeMillis,
    schedule: TalkieDeadlineScheduler? = null,
) {
    private val schedule: TalkieDeadlineScheduler = schedule ?: { delayMs, run ->
        val job = scope.launch {
            delay(delayMs)
            run()
        }
        job::cancel
    }

    private val _phase = MutableStateFlow<TalkieSendPhase>(TalkieSendPhase.Idle)
    val phase: StateFlow<TalkieSendPhase> = _phase.asStateFlow()

    private val _notice = MutableStateFlow<TalkieSendOutcome?>(null)

    /** Ce qu'il faut dire d'une prise de parole qui n'a pas abouti ; l'écran le consomme une fois dit. */
    val notice: StateFlow<TalkieSendOutcome?> = _notice.asStateFlow()

    private val _waking = MutableStateFlow(false)

    /** La prise de parole en cours réveille son destinataire (`delivery: waking`). */
    val waking: StateFlow<Boolean> = _waking.asStateFlow()

    /** Les temps de la dernière prise de parole dont un fragment est parti. */
    var lastLatency: TalkieLatency? = null
        private set

    private class Session(val toUserId: String, pressedAtMs: Long) {
        var opened: TalkieOpened? = null
        var micRunning = false
        var accepting = true
        var released = false
        var finishing = false
        var copying = false
        var copied: List<ByteArray> = emptyList()
        var copyInto: String? = null
        var queue: List<TalkieFragment> = emptyList()
        val fragmenter = TalkieFragmenter()
        val budget = TalkieBudget()
        var cancelDeadline: (() -> Unit)? = null
        var latency = TalkieLatency(pressedAtMs)

        val queuedBytes: Int get() = queue.sumOf { it.data.size }
        val copiedBytes: Int get() = copied.sumOf { it.size }
    }

    private class AwaitingJoin(val talkieId: String, val toUserId: String, val frames: List<ByteArray>)

    private var session: Session? = null
    private var awaitingJoin: List<AwaitingJoin> = emptyList()
    private var earlyVerdicts: List<Pair<String, Boolean>> = emptyList()

    init {
        scope.launch { endedEvents.collect { ended(it.talkieId, it.servedReason, it.joined) } }
        scope.launch { copier.failures.collect { _notice.value = TalkieSendOutcome.FAILED } }
    }

    val isActive: Boolean get() = _phase.value != TalkieSendPhase.Idle

    fun consumeNotice() {
        _notice.value = null
    }

    // Le geste

    fun press(toUserId: String) {
        if (session != null) return
        if (!emitter.isConnected) {
            _notice.value = TalkieSendOutcome.OFFLINE
            return
        }
        val current = Session(toUserId, now())
        session = current
        _phase.value = TalkieSendPhase.Starting(toUserId)
        val verdict = scope.async(start = CoroutineStart.UNDISPATCHED) {
            emitter.start(toUserId).also { current.latency = current.latency.marked(TalkieLatencyStep.OPENED, now()) }
        }
        scope.launch {
            yield()
            val micReady = openMic(current)
            conclude(current, verdict.await(), micReady)
        }
    }

    suspend fun release() {
        val current = session?.takeIf { !it.released } ?: return
        current.released = true
        when {
            current.copying -> finishCopy(current)
            current.opened != null -> finish(current, outcome = null)
            else -> {
                stopMic(current)
                current.fragmenter.flush()?.let { enqueue(current, it) }
            }
        }
    }

    /**
     * La passerelle a fermé une prise de parole : si c'est la mienne, tout s'arrête — sans `talkie:end`. Une voix réveillée
     * que personne n'a rejointe (`joined: false`) part en copie vocale.
     */
    suspend fun ended(talkieId: String, reason: TalkieEndReason?, joined: Boolean? = null) {
        val current = session
        if (current != null && current.opened?.talkieId == talkieId) {
            val outcome = when (reason) {
                TalkieEndReason.SENDER -> null
                TalkieEndReason.LIMIT -> TalkieSendOutcome.LIMIT
                TalkieEndReason.CUT, null -> TalkieSendOutcome.FAILED
            }
            finish(current, outcome, notify = false)
        }
        copyIfUnjoined(talkieId, joined)
    }

    // Interne

    private suspend fun copyIfUnjoined(talkieId: String, joined: Boolean?) {
        val kept = awaitingJoin.firstOrNull { it.talkieId == talkieId }
        if (kept == null) {
            keepEarly(talkieId, joined)
            return
        }
        awaitingJoin = awaitingJoin - kept
        if (joined != false) return
        val sent = copier.send(kept.frames, kept.toUserId, conversationId = null)
        _notice.value = if (sent) TalkieSendOutcome.VOICE else TalkieSendOutcome.FAILED
    }

    /** Un verdict pour la voix réveillée encore en cours de fermeture : il l'attend. */
    private fun keepEarly(talkieId: String, joined: Boolean?) {
        val opened = session?.opened ?: return
        if (joined == null || opened.talkieId != talkieId || opened.delivery != TalkieDelivery.WAKING) return
        earlyVerdicts = (earlyVerdicts.filterNot { it.first == talkieId } + (talkieId to joined)).takeLast(AWAITING_JOIN_CAP)
    }

    /** La voix vient d'être rangée : un verdict arrivé avant elle s'applique maintenant. */
    private suspend fun applyEarlyVerdict(current: Session) {
        val talkieId = current.opened?.talkieId ?: return
        val verdict = earlyVerdicts.firstOrNull { it.first == talkieId } ?: return
        earlyVerdicts = earlyVerdicts - verdict
        copyIfUnjoined(talkieId, verdict.second)
    }

    private suspend fun openMic(current: Session): Boolean {
        val ready = capture.start { data, durationMs -> frame(current, data, durationMs) }
        if (!ready) return false
        current.latency = current.latency.marked(TalkieLatencyStep.MIC_READY, now())
        if (current.finishing || current.released) {
            current.accepting = false
            capture.stop()
        } else {
            current.micRunning = true
        }
        return true
    }

    private suspend fun conclude(current: Session, verdict: TalkieStartVerdict, micReady: Boolean) {
        when {
            verdict is TalkieStartVerdict.VoiceInto && micReady -> {
                current.copyInto = verdict.conversationId
                startCopy(current)
            }
            verdict is TalkieStartVerdict.Refused && verdict.outcome == TalkieSendOutcome.VOICE && micReady -> startCopy(current)
            verdict is TalkieStartVerdict.VoiceInto -> refuse(current, TalkieSendOutcome.MIC_DENIED)
            verdict is TalkieStartVerdict.Refused && verdict.outcome == TalkieSendOutcome.VOICE ->
                refuse(current, TalkieSendOutcome.MIC_DENIED)
            verdict is TalkieStartVerdict.Refused -> refuse(current, verdict.outcome)
            verdict is TalkieStartVerdict.Opened && !micReady -> {
                current.opened = verdict.opened
                finish(current, TalkieSendOutcome.MIC_DENIED)
            }
            verdict is TalkieStartVerdict.Opened -> open(current, verdict.opened)
        }
    }

    private suspend fun open(current: Session, opened: TalkieOpened) {
        current.opened = opened
        current.fragmenter.maxChunkBytes = opened.maxChunkBytes
        if (current.finishing) return
        _phase.value = TalkieSendPhase.Talking(current.toUserId, opened.talkieId)
        _waking.value = opened.delivery == TalkieDelivery.WAKING
        current.cancelDeadline = schedule(opened.maxDurationMs) {
            scope.launch { finish(current, TalkieSendOutcome.LIMIT) }
        }
        val pending = current.queue
        current.queue = emptyList()
        pending.forEach { dispatch(current, it) }
        if (current.released) finish(current, outcome = null)
    }

    private fun frame(current: Session, data: ByteArray, durationMs: Double) {
        if (!current.accepting || data.isEmpty()) return
        if (current.copying) {
            if (current.copiedBytes + data.size <= TalkieContract.MAX_TOTAL_BYTES) current.copied = current.copied + data
            return
        }
        current.fragmenter.append(data, durationMs, now()).forEach { dispatch(current, it) }
    }

    private fun dispatch(current: Session, fragment: TalkieFragment) {
        if (current.opened == null) {
            enqueue(current, fragment)
            return
        }
        if (transmit(current, fragment)) return
        scope.launch { finish(current, TalkieSendOutcome.LIMIT) }
    }

    private fun enqueue(current: Session, fragment: TalkieFragment) {
        if (current.queuedBytes + fragment.data.size > TalkieContract.MAX_TOTAL_BYTES) return
        current.queue = current.queue + fragment
    }

    /** `false` : le fragment ferait dépasser un plafond de la prise de parole. */
    private fun transmit(current: Session, fragment: TalkieFragment): Boolean {
        val opened = current.opened ?: return true
        if (fragment.data.isEmpty()) return true
        val seq = current.budget.admit(fragment.data.size) ?: return false
        emitter.sendChunk(opened.talkieId, seq, fragment.capturedAtMs, fragment.data)
        if (opened.delivery == TalkieDelivery.WAKING) current.copied = current.copied + fragment.data
        if (seq == 0) record(current)
        return true
    }

    private fun record(current: Session) {
        current.latency = current.latency.marked(TalkieLatencyStep.FIRST_CHUNK, now())
        lastLatency = current.latency
        Timber.i("talkie · émission · %s", current.latency.summary)
    }

    private suspend fun stopMic(current: Session) {
        if (current.micRunning) {
            current.micRunning = false
            capture.stop()
        }
        current.accepting = false
    }

    /** Ferme une prise de parole OUVERTE : micro arrêté, reste vidé, `talkie:end` (sauf si le serveur l'a déjà close). */
    private suspend fun finish(current: Session, outcome: TalkieSendOutcome?, notify: Boolean = true) {
        if (current.finishing) return
        current.finishing = true
        current.cancelDeadline?.invoke()
        if (!notify) current.accepting = false
        stopMic(current)
        val opened = current.opened
        if (opened != null && notify) {
            current.fragmenter.flush()?.let { transmit(current, it) }
            emitter.end(opened.talkieId)
        } else if (opened?.delivery == TalkieDelivery.WAKING) {
            current.fragmenter.flush()?.let { current.copied = current.copied + it.data }
        }
        settle(current, outcome)
        applyEarlyVerdict(current)
    }

    private suspend fun refuse(current: Session, outcome: TalkieSendOutcome) {
        current.finishing = true
        current.accepting = false
        stopMic(current)
        settle(current, outcome)
    }

    /** Le repli : ce qui est déjà capté rejoint la copie, et le micro continue jusqu'au relâchement ou à la durée maximale. */
    private suspend fun startCopy(current: Session) {
        current.copying = true
        current.copied = current.queue.map { it.data } + listOfNotNull(current.fragmenter.flush()?.data)
        current.queue = emptyList()
        if (current.released) {
            finishCopy(current)
            return
        }
        _phase.value = TalkieSendPhase.RecordingCopy(current.toUserId)
        current.cancelDeadline = schedule(TalkieContract.MAX_DURATION_MS) {
            scope.launch { finishCopy(current) }
        }
    }

    private suspend fun finishCopy(current: Session) {
        if (current.finishing) return
        current.finishing = true
        current.cancelDeadline?.invoke()
        stopMic(current)
        val sent = copier.send(current.copied, current.toUserId, current.copyInto)
        settle(current, if (sent) TalkieSendOutcome.VOICE else TalkieSendOutcome.FAILED)
    }

    private fun settle(current: Session, outcome: TalkieSendOutcome?) {
        current.cancelDeadline?.invoke()
        current.cancelDeadline = null
        val opened = current.opened
        if (opened != null && opened.delivery == TalkieDelivery.WAKING && current.copied.isNotEmpty()) {
            awaitingJoin = (awaitingJoin + AwaitingJoin(opened.talkieId, current.toUserId, current.copied)).takeLast(AWAITING_JOIN_CAP)
            current.copied = emptyList()
        }
        if (session === current) {
            session = null
            _phase.value = TalkieSendPhase.Idle
            _waking.value = false
        }
        if (outcome != null) _notice.value = outcome
    }

    private companion object {
        /** Les voix réveillées closes, gardées jusqu'au verdict `joined`. Bornées : rien ne grossit. */
        const val AWAITING_JOIN_CAP = 4
    }
}
