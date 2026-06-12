import SwiftUI
import AVFoundation
import MeeshySDK

/// Cellule audio dans le panel composer (`ComposerToolPanelHost.mediaPanel`).
///
/// Affiche un audio attaché à la slide avec :
/// - Bouton play/pause local (preview via `AudioPlaybackManager`)
/// - Waveform 40 barres (cache via `WaveformCache.shared` côté `AudioWaveformAnalyzer`)
/// - Durée formatée mm:ss
/// - Toggle fg/bg (`speaker.wave.2.circle[.fill]`)
/// - Slider volume 0-1
/// - Bouton supprimer
///
/// Preview est isolée du `StoryTimelineEngine` — chaque cellule possède son
/// propre `AudioPlaybackManager`, le `PlaybackCoordinator.shared` garantit
/// l'exclusivité avec les autres `AudioPlaybackManager` de l'app.
@MainActor
struct StoryAudioCell: View {
    let audio: StoryAudioPlayerObject
    let url: URL?
    let isBackground: Bool
    let onToggleBackground: () -> Void
    let onVolumeChanged: (Float) -> Void
    let onDelete: () -> Void

    @Environment(\.colorScheme) private var colorScheme
    @StateObject private var waveform = AudioWaveformAnalyzer()
    @StateObject private var playback = AudioPlaybackManager()

    @State private var localVolume: Float = 1.0
    @State private var didStartWaveform = false

    private var primaryText: Color { colorScheme == .dark ? .white : MeeshyColors.indigo950 }
    private var secondaryText: Color { (colorScheme == .dark ? Color.white : MeeshyColors.indigo950).opacity(0.78) }
    private var rowBgFill: Color {
        isBackground
            ? MeeshyColors.indigo400.opacity(0.18)
            : (colorScheme == .dark ? Color.white.opacity(0.07) : MeeshyColors.indigo950.opacity(0.05))
    }

    var body: some View {
        HStack(spacing: 8) {
            playPauseButton
            waveformView
                .frame(maxWidth: .infinity)
            durationLabel
            toggleBackgroundButton
            volumeSlider
            deleteButton
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 6)
        .background(
            RoundedRectangle(cornerRadius: 8)
                .fill(rowBgFill)
        )
        .onAppear {
            localVolume = audio.volume
            startWaveformIfNeeded()
        }
        .onDisappear {
            // Une preview en cours continuait sinon de jouer après la
            // fermeture du panel, jusqu'au dealloc du @StateObject
            // (le mutex PlaybackCoordinator ne couvre que la préemption
            // par un AUTRE player, pas le close du panel).
            playback.stop()
        }
        .adaptiveOnChange(of: url) { _, _ in
            // L'URL peut être résolue après le mount (cache miss → fetch async).
            didStartWaveform = false
            startWaveformIfNeeded()
        }
        // ⚠ Ne JAMAIS publier `localVolume` à chaque tick du drag (~60 Hz).
        // Le commit final est délégué au callback `onEditingChanged` du
        // `Slider` (cf. `volumeSlider`). Pendant le drag l'UI reste fluide
        // via le `@State` local, et le ViewModel ne reçoit qu'UN
        // `setAudioVolume` quand l'utilisateur lâche le pouce — sans ça
        // chaque tick mutait `@Published slides`, ce qui re-publiait l'arbre
        // entier du composer et faisait scintiller toutes les vues
        // observant le VM (canvas, miniatures, timeline tracks).
    }

    // MARK: - Subviews

    private var playPauseButton: some View {
        Button {
            togglePlayback()
            HapticFeedback.light()
        } label: {
            Image(systemName: playback.isPlaying ? "pause.circle.fill" : "play.circle.fill")
                .font(.system(size: 26, weight: .medium))
                .foregroundColor(MeeshyColors.indigo500)
                .frame(width: 28, height: 28)
        }
        .buttonStyle(.plain)
        .disabled(url == nil)
        .accessibilityLabel(playback.isPlaying ? "Pause" : "Play")
    }

    private var waveformView: some View {
        let samples: [Float] = {
            if !waveform.samples.isEmpty { return waveform.samples }
            if !audio.waveformSamples.isEmpty { return audio.waveformSamples }
            return AudioWaveformAnalyzer.generateFallback(count: 40)
        }()
        let progress = playback.duration > 0
            ? min(1.0, max(0.0, playback.currentTime / playback.duration))
            : 0
        return HStack(spacing: 1.5) {
            ForEach(Array(samples.enumerated()), id: \.offset) { idx, value in
                let played = Double(idx) / Double(max(1, samples.count - 1)) <= progress
                Capsule()
                    .fill(played ? MeeshyColors.indigo500 : secondaryText)
                    .frame(width: 2, height: max(3, CGFloat(value) * 22))
            }
        }
        .frame(height: 24)
    }

    private var durationLabel: some View {
        Text(formatDuration(playback.duration))
            .font(.system(size: 10, weight: .medium, design: .monospaced))
            .foregroundColor(secondaryText)
            .frame(minWidth: 32)
    }

    private var toggleBackgroundButton: some View {
        Button {
            onToggleBackground()
            HapticFeedback.light()
        } label: {
            Image(systemName: isBackground ? "speaker.wave.2.circle.fill" : "speaker.wave.2.circle")
                .font(.system(size: 18, weight: .medium))
                .foregroundColor(isBackground ? MeeshyColors.indigo400 : secondaryText)
                .frame(width: 28, height: 28)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(isBackground ? "Fond" : "Premier plan")
    }

    private var volumeSlider: some View {
        // Slider compact — fixe à 60pt, glissière de volume locale.
        // `onEditingChanged` commit le volume au VM UNIQUEMENT quand l'user
        // lâche le pouce (`editing == false`) — pas pendant le drag.
        // L'UI du slider reste fluide via le `@State localVolume`.
        Slider(
            value: $localVolume,
            in: 0...1,
            step: 0.05,
            onEditingChanged: { editing in
                if !editing {
                    onVolumeChanged(localVolume)
                }
            }
        )
        .tint(MeeshyColors.indigo400)
        .frame(width: 60)
        .accessibilityLabel("Volume")
        .accessibilityValue("\(Int(localVolume * 100))%")
    }

    private var deleteButton: some View {
        Button {
            playback.stop()
            onDelete()
            HapticFeedback.medium()
        } label: {
            Image(systemName: "xmark.circle.fill")
                .font(.system(size: 16, weight: .medium))
                .foregroundColor(.red.opacity(0.85))
                .frame(width: 22, height: 22)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Supprimer")
    }

    // MARK: - Actions

    private func togglePlayback() {
        guard let url else { return }
        if playback.currentUrl == nil {
            // 1ère lecture — choix file:// vs https:// via AudioPlaybackManager
            if url.isFileURL {
                playback.playLocal(url: url)
            } else {
                playback.play(urlString: url.absoluteString)
            }
        } else {
            playback.togglePlayPause()
        }
    }

    private func startWaveformIfNeeded() {
        guard !didStartWaveform, let url else { return }
        didStartWaveform = true
        if url.isFileURL {
            waveform.analyze(url: url, barCount: 40)
        } else {
            // URL distante : on délègue à WaveformCache qui résoudra via le cache audio.
            waveform.analyze(url: url, barCount: 40)
        }
    }

    private func formatDuration(_ seconds: TimeInterval) -> String {
        guard seconds.isFinite, seconds >= 0 else { return "0:00" }
        let total = Int(seconds.rounded())
        let m = total / 60
        let s = total % 60
        return String(format: "%d:%02d", m, s)
    }
}
