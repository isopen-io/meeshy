import SwiftUI
import MeeshySDK

// MARK: - Audio Player Rules

extension AudioPlayerView {
    /// Pure resolution of the transcription strip's STARTING language: the
    /// caller-resolved Prisme preference (`initialTranscriptionLanguage`)
    /// wins when provided, else `"orig"` — the unchanged default for every
    /// existing call site. Extracted as a `nonisolated static` helper (same
    /// pattern as `shouldDelegateToParent` / `shouldStopOwnedEngineOnDisappear`
    /// elsewhere in this file) so the seeding decision is unit-testable
    /// without a SwiftUI render lifecycle.
    nonisolated public static func resolveInitialTranscriptionLanguage(_ initialTranscriptionLanguage: String?) -> String {
        initialTranscriptionLanguage ?? "orig"
    }

    /// Pure resolution of the actual URL `handlePlayTap` hands the playback
    /// engine. Prisme audio-follow — `selectedLanguage` is
    /// steered to playback whenever `hasExplicitLanguage` is `true`, whether
    /// that came from the automatic Prisme seed in `init` or from an
    /// explicit `switchToLanguage` call. When `false` (no Prisme translation
    /// resolved and no user action yet), this always resolves to
    /// `originalUrl`. Extracted as a `nonisolated static` helper — same
    /// pattern as `resolveInitialTranscriptionLanguage` / `shouldDelegateToParent`
    /// elsewhere in this file — so it is unit-testable without a SwiftUI
    /// render lifecycle.
    nonisolated internal static func resolvePlaybackUrl(
        selectedLanguage: String,
        hasExplicitLanguage: Bool,
        translatedAudios: [MessageTranslatedAudio],
        originalUrl: String
    ) -> String {
        guard hasExplicitLanguage, selectedLanguage != "orig",
              let translated = translatedAudios.first(where: {
                  $0.targetLanguage.lowercased() == selectedLanguage.lowercased()
              })
        else { return originalUrl }
        return translated.url
    }

    /// Pure routing decision used by `handlePlayTap`. Extracted as a
    /// `nonisolated static` helper so it can be unit-tested without a SwiftUI
    /// render lifecycle. Returns `true` iff the play tap should be delegated
    /// to `onPlayRequest` instead of touching the locally resolved `player`.
    nonisolated internal static func shouldDelegateToParent(
        usesExternalPlayer: Bool,
        playerAttachmentId: String?,
        bubbleAttachmentId: String
    ) -> Bool {
        if !usesExternalPlayer { return true }
        return playerAttachmentId != bubbleAttachmentId
    }

    /// Pure decision: should the owned playback engine be stopped when this
    /// view leaves the hierarchy? `true` only for the owned-engine path (post
    /// detail, feed post cards, composer preview, standalone players). An
    /// externally-injected engine (e.g. `ConversationAudioCoordinator`) is
    /// owned by a parent that survives view churn and intentionally keeps
    /// playing (mini-player + background continuation), so it must NOT be
    /// stopped here. Extracted as a `nonisolated static` so the lifecycle
    /// contract is unit-testable without a SwiftUI render lifecycle.
    /// Le registre statique d'autoplay n'enchaîne que les lecteurs AUTONOMES.
    /// Une vue dont le parent route le tap (`onPlayRequest`) appartient à un
    /// coordinateur qui possède la lecture ET l'enchaînement, même quand elle
    /// est inactive (pas de moteur externe) : l'inscrire faisait repartir, à
    /// la fin d'une piste, la bulle apparue avant elle — en remontant le fil,
    /// sans regarder l'auteur (#10730).
    nonisolated internal static func joinsLegacyAutoplay(usesExternalPlayer: Bool, routesPlayToParent: Bool) -> Bool {
        !usesExternalPlayer && !routesPlayToParent
    }

    nonisolated internal static func shouldStopOwnedEngineOnDisappear(usesExternalPlayer: Bool) -> Bool {
        !usesExternalPlayer
    }

    /// What the widget SHOWS for "how far along am I" — one resolution behind
    /// the waveform tint, the percentage chip AND the elapsed timecode, so the
    /// three can never contradict each other.
    ///
    /// While the engine plays, its own head wins: the timecode must track the
    /// audio coming out of the speaker even if the user scrubbed backwards past
    /// the monotonic consumption mark.
    ///
    /// At rest — a fresh launch, a bubble whose engine was never attached — the
    /// two persisted facts answer two different questions and are kept apart:
    /// `fraction` (waveform + chip) reports how much of the note has EVER been
    /// consumed, while `elapsed` reports where the play button will START. They
    /// coincide on a simple pause; they diverge when an already-finished note
    /// is re-listened and paused mid-way (100 % consumed, resumes at 0:22).
    nonisolated public static func progressDisplay(
        liveProgress: Double,
        liveCurrentTime: TimeInterval,
        restingProgress: Double,
        resumePosition: TimeInterval?,
        totalDuration: TimeInterval
    ) -> AudioProgressDisplay {
        guard liveProgress <= 0 else {
            return AudioProgressDisplay(
                fraction: liveProgress, elapsed: liveCurrentTime, isLive: true)
        }
        let fraction = max(0, min(1, restingProgress))
        guard totalDuration > 0 else {
            return AudioProgressDisplay(fraction: fraction, elapsed: 0, isLive: false)
        }
        // Consumption is monotonic and sticky-complete; the resume point is the
        // only value that predicts where the play button will start.
        let elapsed = resumePosition.map { max(0, min(totalDuration, $0)) }
            ?? fraction * totalDuration
        return AudioProgressDisplay(fraction: fraction, elapsed: elapsed, isLive: false)
    }

    /// Maps a touch / drag x-position within the waveform strip to a normalized
    /// seek fraction (0...1), clamped at both edges. Single source of truth for
    /// BOTH the tap-to-seek and the swipe-to-scrub gestures on `waveformProgress`
    /// so the two paths can never compute the position differently. Guards a
    /// zero / negative width (pre-layout `GeometryReader` tick) so it never
    /// divides by zero. Pure; unit-tested.
    nonisolated public static func scrubFraction(locationX: CGFloat, width: CGFloat) -> Double {
        guard width > 0 else { return 0 }
        return Double(max(0, min(width, locationX)) / width)
    }
}
