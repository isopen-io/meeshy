import SwiftUI
import AVKit
import MeeshySDK
import MeeshyUI

// Extrait de `ReelsPlayerView.swift` (#7625) : la couche AUDIO d'un réel —
// le transcript héros et le contrôle de lecture.

// MARK: - Reel Audio (media layer — immersive transcript hero)

/// The media layer of an audio reel: the TRANSCRIPTION is the hero, rendered
/// large and centered like spoken words over a dark accent-tinted canvas. The
/// play/scrub control and the language-flag strip are CHROME (owned by
/// `ReelPageView`, on top of this layer) — keeping them out of the media layer
/// is what makes them tappable and lets the immersive long-press hide them while
/// the transcript (the content) stays. The transcript follows `selectedLanguage`
/// (a binding shared with the chrome flag strip + audio control) so a flag tap
/// swaps the displayed text in lockstep with the audio that plays.
struct ReelAudioView: View {
    let media: FeedMedia
    let accentColor: String
    /// Shared with the chrome: a flag tap (or the audio control's language
    /// switch) updates this and the hero transcript re-resolves. `nil` = original.
    @Binding var selectedLanguage: String?
    /// Same engine the `ReelAudioControl` plays/scrubs (injected as its
    /// `externalPlayer`). Observed here so the karaoke highlight + auto-scroll
    /// track the live playback position.
    @ObservedObject var player: AudioPlaybackManager

    /// Timed segments for the currently-explored language. Reuses the SDK's pure
    /// resolver so the hero matches exactly what the player plays.
    private var displaySegments: [TranscriptionDisplaySegment] {
        let token = selectedLanguage ?? "orig"
        return AudioPlayerView.resolveDisplaySegments(
            selectedLanguage: token,
            transcription: media.transcription,
            translatedAudios: media.translatedAudios
        )
    }

    var body: some View {
        ZStack {
            // Dark immersive canvas tinted with the reel accent — matches the
            // video/image reels' dark aesthetic rather than a bright gradient.
            LinearGradient(
                colors: [
                    Color(hex: accentColor).opacity(0.55),
                    .black,
                    Color(hex: accentColor).opacity(0.35)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            // Subtle large waveform watermark behind the transcript.
            // Glyphe décoratif ≥40pt : figé (doctrine 74i/86i) + masqué VoiceOver
            Image(systemName: "waveform")
                .font(.system(size: 220, weight: .semibold))
                .foregroundColor(.white.opacity(0.05))
                .allowsHitTesting(false)
                .accessibilityHidden(true)

            heroLayer
        }
    }

    @ViewBuilder
    private var heroLayer: some View {
        if displaySegments.isEmpty {
            // No transcript yet — keep a prominent waveform glyph as the hero so
            // the screen never reads as empty.
            // Glyphe héros décoratif ≥40pt : figé (doctrine 74i/86i) + masqué VoiceOver
            Image(systemName: "waveform")
                .font(.system(size: 84, weight: .semibold))
                .foregroundColor(.white.opacity(0.92))
                .shadow(color: .black.opacity(0.35), radius: 10)
                .accessibilityHidden(true)
        } else {
            // Karaoke transcript: the active segment ([startTime, endTime) of the
            // live `player.currentTime`) is highlighted + auto-scrolled to centre.
            // Smaller, scrollable text (font 14, own ScrollView) replaces the
            // former single 27pt joined block. `onSeek` lets a tap jump playback.
            MediaTranscriptionView(
                segments: displaySegments,
                currentTime: player.currentTime,
                accentColor: accentColor,
                maxHeight: 360,
                isPlaying: player.isPlaying,
                progress: player.progress,
                fontSize: 22,
                onSeek: { time in player.seekToTime(time) }
            )
            .padding(.horizontal, 20)
            // Clear the bottom chrome (control + flags + author + rail).
            .padding(.bottom, 200)
            // Cross-fade when the language (and thus the segments) changes.
            .id(selectedLanguage ?? "orig")
            .transition(.opacity)
        }
    }
}

// MARK: - Reel Audio Control (chrome layer — play/scrub for an audio reel)

/// The audio play/scrub control for an audio reel, rendered in the CHROME layer
/// (on top of the transcript hero) so it stays tappable and fades with the rest
/// of the chrome in immersive mode. Reuses `AudioPlayerView` in its compact form
/// — which hides the player's own transcription card + language pills, so the
/// reel's hero transcript and `ReelMetaRow` flag strip own those, app-side, with
/// no duplication. `selectedLanguage` is shared with the flag strip + the hero,
/// so switching a flag plays that language's translated audio (when a TTS variant
/// exists) AND swaps the transcript text — mirroring the message-bubble UX.
struct ReelAudioControl: View {
    let media: FeedMedia
    @Binding var selectedLanguage: String?
    /// Shared engine (owned by `ReelPageView`) so the hero transcript
    /// (`ReelAudioView` → `MediaTranscriptionView`) tracks the SAME playback.
    let player: AudioPlaybackManager
    var onFullscreen: () -> Void = {}

    private var attachment: MeeshyMessageAttachment { media.toMessageAttachment() }

    var body: some View {
        AudioAvailabilityResolver(attachment: attachment, autoDownload: true) { availability, onDownload in
            AudioPlayerView(
                attachment: attachment,
                context: .messageBubble,
                accentColor: media.thumbnailColor,
                translatedAudios: media.translatedAudios,
                onFullscreen: onFullscreen,
                externalLanguage: $selectedLanguage,
                availability: availability,
                onDownload: onDownload,
                externalPlayer: player
            )
        }
    }
}
