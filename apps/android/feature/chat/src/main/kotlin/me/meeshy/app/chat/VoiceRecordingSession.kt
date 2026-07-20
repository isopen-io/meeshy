package me.meeshy.app.chat

import me.meeshy.sdk.model.waveform.AudioLevelNormalizer
import me.meeshy.sdk.model.waveform.WaveformLevelWindow
import kotlin.math.floor

/**
 * The two phases of the composer's voice-recording pill.
 *
 * [Idle] is the text-composer state (no pill). [Recording] is the iMessage-style
 * pill: a live timer, a blinking record dot, a rolling waveform strip, and the
 * cancel / stop / send controls.
 */
enum class VoiceRecordingPhase { Idle, Recording }

/**
 * The result of releasing the recording — what the pill should do with the take.
 *
 * A faithful port of iOS `UniversalComposerBar` recording endings:
 * - [Completed]: the take met the minimum length; hand off a voice note of
 *   [durationSeconds] with the current [levels] (iOS `stopRecordingToAttachment` /
 *   `sendRecording`).
 * - [TooShort]: the take was below [VoiceRecordingSession.MINIMUM_SENDABLE_SECONDS];
 *   discard it silently (iOS `guard recordingDuration > 0.5` → cancel).
 * - [Inactive]: there was no recording in progress; the stop is a no-op.
 */
sealed interface VoiceRecordingOutcome {
    data class Completed(val durationSeconds: Double, val levels: List<Float>) : VoiceRecordingOutcome
    data object TooShort : VoiceRecordingOutcome
    data object Inactive : VoiceRecordingOutcome
}

/**
 * The pair returned by [VoiceRecordingSession.stop]: the next [session] (always
 * back to idle) plus the [outcome] describing what to do with the finished take.
 * Bundled together so the caller applies both atomically.
 */
data class VoiceRecordingStop(
    val session: VoiceRecordingSession,
    val outcome: VoiceRecordingOutcome,
)

/**
 * Pure, immutable state machine for the composer's iMessage-style voice-recording
 * pill — the single source of truth for "how long has this been recording, can it
 * be sent yet, and what happens on cancel / stop / send". A faithful port of the
 * recording logic scattered across iOS `UniversalComposerBar+Recording.swift`
 * (`minimumSendableDuration`, `canSend`, `formatDuration`, the blinking `dotOpacity`,
 * and the `cancel` / `stopRecordingToAttachment` / `sendRecording` transitions),
 * gathered into one JVM-testable value type.
 *
 * **Surpasses iOS** by (1) making every transition a pure function that returns a
 * new session rather than mutating scattered `@State` on the view, (2) defining the
 * inert cases the iOS imperative code left implicit (tick / meter / stop while idle,
 * non-positive tick deltas), and (3) reusing the shared `:core:model` waveform
 * building blocks ([AudioLevelNormalizer], [WaveformLevelWindow]) instead of a
 * bespoke level buffer — one metering law across the whole app.
 *
 * The rolling waveform [levels] are the *recent* window (oldest first), not the whole
 * take, matching iOS's fixed-size `levelHistory`. The actual microphone capture is
 * Android-runtime glue that lives app-side and feeds each reading through [meter].
 */
class VoiceRecordingSession private constructor(
    val phase: VoiceRecordingPhase,
    val elapsedSeconds: Double,
    val levelCapacity: Int,
    private val window: WaveformLevelWindow,
) {
    /** True while the pill is live (recording in progress). */
    val isRecording: Boolean get() = phase == VoiceRecordingPhase.Recording

    /** The rolling waveform strip, oldest reading first. */
    val levels: List<Float> get() = window.levels

    /**
     * True once the take is long enough to send. Matches the iOS pill's
     * `canSend = effectiveDuration >= minimumSendableDuration` — inclusive of the
     * floor, and only while recording.
     */
    val canSend: Boolean get() = isRecording && elapsedSeconds >= MINIMUM_SENDABLE_SECONDS

    /**
     * The `m:ss` timer label (unpadded minutes, zero-padded seconds), truncating
     * fractional seconds — the same shape as iOS `formatDuration(_:)`.
     */
    val formattedElapsed: String
        get() {
            val total = elapsedSeconds.toInt()
            val minutes = total / 60
            val seconds = total % 60
            return "$minutes:${seconds.toString().padStart(2, '0')}"
        }

    /**
     * The record-dot opacity for the current instant — a 1s blink between fully
     * opaque and dimmed. Mirrors iOS
     * `effectiveDuration.truncatingRemainder(dividingBy: 1) < 0.5 ? 1 : 0.3`, and
     * pins to fully opaque when [reduceMotion] is on (no blink).
     */
    fun recordingDotOpacity(reduceMotion: Boolean): Float {
        if (reduceMotion) return 1f
        val fractional = elapsedSeconds - floor(elapsedSeconds)
        return if (fractional < 0.5) 1f else 0.3f
    }

    /**
     * Begin a fresh recording from an idle session. Idempotent while already
     * recording (returns `this`, never clobbering an in-progress take).
     */
    fun start(): VoiceRecordingSession {
        if (isRecording) return this
        return VoiceRecordingSession(
            phase = VoiceRecordingPhase.Recording,
            elapsedSeconds = 0.0,
            levelCapacity = levelCapacity,
            window = WaveformLevelWindow.filled(levelCapacity),
        )
    }

    /**
     * Advance the timer by [deltaSeconds]. Inert on an idle session or for a
     * non-positive delta (a stray zero/negative frame can never rewind the clock).
     */
    fun tick(deltaSeconds: Double): VoiceRecordingSession {
        if (!isRecording || deltaSeconds <= 0.0) return this
        return VoiceRecordingSession(phase, elapsedSeconds + deltaSeconds, levelCapacity, window)
    }

    /**
     * Feed a raw microphone power reading (decibels) into the waveform strip,
     * normalised via [AudioLevelNormalizer]. Inert on an idle session.
     */
    fun meter(powerDb: Float): VoiceRecordingSession {
        if (!isRecording) return this
        val normalized = AudioLevelNormalizer.normalize(powerDb)
        return VoiceRecordingSession(phase, elapsedSeconds, levelCapacity, window.push(normalized))
    }

    /** Discard the take and return to a clean idle session. */
    fun cancel(): VoiceRecordingSession = idle(levelCapacity)

    /**
     * End the recording. A take at or above [MINIMUM_SENDABLE_SECONDS] yields
     * [VoiceRecordingOutcome.Completed] with the duration and current [levels]; a
     * shorter take yields [VoiceRecordingOutcome.TooShort]; stopping while idle is
     * [VoiceRecordingOutcome.Inactive]. Either way the returned session is idle.
     */
    fun stop(): VoiceRecordingStop {
        if (!isRecording) return VoiceRecordingStop(idle(levelCapacity), VoiceRecordingOutcome.Inactive)
        val outcome =
            if (elapsedSeconds >= MINIMUM_SENDABLE_SECONDS) {
                VoiceRecordingOutcome.Completed(elapsedSeconds, levels)
            } else {
                VoiceRecordingOutcome.TooShort
            }
        return VoiceRecordingStop(idle(levelCapacity), outcome)
    }

    companion object {
        /** iOS `UniversalComposerBar.minimumSendableDuration`. */
        const val MINIMUM_SENDABLE_SECONDS: Double = 0.5

        /**
         * A clean idle session. The waveform strip is seeded flat (a full window of
         * zeros) so the pill renders a level baseline before the first real reading,
         * mirroring iOS's initial `audioLevels = Array(repeating: 0, count: 15)`.
         */
        fun idle(levelCapacity: Int = WaveformLevelWindow.DEFAULT_CAPACITY): VoiceRecordingSession {
            val cap = levelCapacity.coerceAtLeast(0)
            return VoiceRecordingSession(
                phase = VoiceRecordingPhase.Idle,
                elapsedSeconds = 0.0,
                levelCapacity = cap,
                window = WaveformLevelWindow.filled(cap),
            )
        }
    }
}
