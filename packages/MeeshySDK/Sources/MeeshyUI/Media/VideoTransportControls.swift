import SwiftUI
import AVKit

// MARK: - Shared Video Transport Controls
//
// Composant PUBLIC réutilisable des contrôles de transport vidéo (play/pause,
// skip ±10s, seek bar scrubbable haute-priorité, timecodes, vitesse, mini-toolbar
// mute/loop/pip/airplay). Piloté par `SharedAVPlayerManager` + une `ControlSet`
// + une couleur d'accent.
//
// Utilisé par la galerie média conversation (`ConversationMediaGalleryView`) qui,
// avant ce composant, rendait une couche `AVPlayerLayer` BRUTE sans aucun contrôle
// de transport ("AUCUN CONTROLEUR" en plein écran). La galerie possède déjà sa
// propre chrome (close/save/métadonnées/dismiss) → ce composant n'apporte QUE le
// transport, sans scrim ni top bar (l'hôte fournit son fond + ses actions fichier).
//
// `_FullscreenOverlayControls` compose désormais ce transport ; seul
// `_InlineOverlayControls` (variante compacte distincte) garde sa propre copie.
public struct VideoTransportControls: View {
    @ObservedObject private var manager: SharedAVPlayerManager
    private let accentColor: String
    private let controls: MeeshyVideoPlayer.ControlSet

    @State private var isSeeking = false
    @State private var seekValue: Double = 0

    private let speeds: [PlaybackSpeed] = [.x1_0, .x1_25, .x1_5, .x1_75, .x2_0]

    public init(
        manager: SharedAVPlayerManager,
        accentColor: String,
        controls: MeeshyVideoPlayer.ControlSet
    ) {
        self.manager = manager
        self.accentColor = accentColor
        self.controls = controls
    }

    private var accent: Color { Color(hex: accentColor) }

    private var progress: Double {
        guard manager.duration > 0 else { return 0 }
        return isSeeking ? seekValue : manager.currentTime / manager.duration
    }

    public var body: some View {
        VStack(spacing: 0) {
            Spacer()
            centerControls
            Spacer()
            bottomStack
        }
        .buttonStyle(BouncyTransportButtonStyle())
    }

    private var centerControls: some View {
        HStack(spacing: 40) {
            if controls.contains(.scrubber) { skipButton(systemName: "gobackward.10", seconds: -10) }
            if controls.contains(.playPause) { playPauseButton }
            if controls.contains(.scrubber) { skipButton(systemName: "goforward.10", seconds: 10) }
        }
    }

    private func skipButton(systemName: String, seconds: Double) -> some View {
        Button {
            manager.skip(seconds: seconds)
            HapticFeedback.light()
        } label: {
            Image(systemName: systemName)
                .font(.system(size: 26, weight: .semibold))
                .foregroundColor(.white)
                .frame(width: 56, height: 56)
                .background(
                    ZStack {
                        Circle().fill(.ultraThinMaterial)
                        Circle().fill(Color.white.opacity(0.10))
                    }
                )
                .overlay(Circle().stroke(Color.white.opacity(0.12), lineWidth: 0.5))
        }
    }

    private var playPauseButton: some View {
        Button {
            manager.togglePlayPause()
            HapticFeedback.light()
        } label: {
            ZStack {
                Circle().fill(.ultraThinMaterial)
                Circle().fill(accent.opacity(0.55))
                Image(systemName: manager.isPlaying ? "pause.fill" : "play.fill")
                    .font(.system(size: 32, weight: .bold))
                    .foregroundColor(.white)
                    .offset(x: manager.isPlaying ? 0 : 3)
                    .adaptiveSymbolReplace(id: manager.isPlaying)
            }
            .frame(width: 72, height: 72)
            .overlay(Circle().stroke(Color.white.opacity(0.25), lineWidth: 0.8))
            .shadow(color: accent.opacity(0.4), radius: 14, y: 4)
        }
        .accessibilityLabel(manager.isPlaying ? "Pause" : "Play")
    }

    private var bottomStack: some View {
        VStack(spacing: 8) {
            miniToolbar.padding(.horizontal, 16)
            if controls.contains(.scrubber) { seekBar.padding(.horizontal, 16) }
            if controls.contains(.duration) {
                HStack {
                    Text(formatMediaDuration(isSeeking ? seekValue * manager.duration : manager.currentTime))
                        .font(.system(size: 12, weight: .semibold, design: .monospaced))
                        .foregroundColor(.white.opacity(0.75))
                    Spacer()
                    Text(formatMediaDuration(manager.duration))
                        .font(.system(size: 12, weight: .semibold, design: .monospaced))
                        .foregroundColor(.white.opacity(0.75))
                }
                .padding(.horizontal, 16)
            }
            if controls.contains(.speed) { speedRow.padding(.horizontal, 16) }
        }
    }

    @ViewBuilder
    private var miniToolbar: some View {
        let hasAny = controls.contains(.mute) || controls.contains(.loop)
            || controls.contains(.pip) || controls.contains(.airplay)
        if hasAny {
            HStack(spacing: 16) {
                Spacer()
                if controls.contains(.mute) { muteButton }
                if controls.contains(.loop) { loopButton }
                if controls.contains(.pip) { pipButton }
                if controls.contains(.airplay) { airplayButton }
                Spacer()
            }
        }
    }

    private var muteButton: some View {
        Button {
            manager.isMuted.toggle()
            HapticFeedback.light()
        } label: {
            toolbarIcon(systemName: manager.isMuted ? "speaker.slash.fill" : "speaker.wave.2.fill", isActive: manager.isMuted)
        }
        .accessibilityLabel(manager.isMuted ? "Reactiver le son" : "Couper le son")
    }

    private var loopButton: some View {
        Button {
            manager.shouldLoop.toggle()
            HapticFeedback.light()
        } label: {
            toolbarIcon(systemName: "repeat", isActive: manager.shouldLoop)
        }
        .accessibilityLabel(manager.shouldLoop ? "Desactiver lecture en boucle" : "Activer lecture en boucle")
    }

    private var pipButton: some View {
        let supported = AVPictureInPictureController.isPictureInPictureSupported()
        return Button {
            if manager.isPipActive { manager.stopPip() } else { manager.startPip() }
            HapticFeedback.light()
        } label: {
            toolbarIcon(systemName: manager.isPipActive ? "pip.exit" : "pip.enter", isActive: manager.isPipActive)
                .opacity(supported ? 1.0 : 0.4)
        }
        .disabled(!supported)
        .accessibilityLabel(manager.isPipActive ? "Sortir du picture in picture" : "Activer picture in picture")
    }

    private var airplayButton: some View {
        AirPlayRoutePicker(tintColor: .white)
            .frame(width: 36, height: 36)
            .background(
                ZStack {
                    Circle().fill(.ultraThinMaterial)
                    Circle().fill(Color.white.opacity(0.10))
                }
            )
            .overlay(Circle().stroke(Color.white.opacity(0.12), lineWidth: 0.5))
            .accessibilityLabel("AirPlay")
    }

    private func toolbarIcon(systemName: String, isActive: Bool) -> some View {
        Image(systemName: systemName)
            .font(.system(size: 14, weight: .semibold))
            .foregroundColor(.white)
            .frame(width: 36, height: 36)
            .background(
                ZStack {
                    Circle().fill(.ultraThinMaterial)
                    Circle().fill(isActive ? accent : Color.white.opacity(0.10))
                }
            )
            .overlay(Circle().stroke(Color.white.opacity(0.12), lineWidth: 0.5))
    }

    private var seekBar: some View {
        GeometryReader { geo in
            let trackHeight: CGFloat = 4
            let thumbSize: CGFloat = 14
            let filledWidth = geo.size.width * progress

            ZStack(alignment: .leading) {
                Capsule().fill(Color.white.opacity(0.3)).frame(height: trackHeight)
                Capsule().fill(accent).frame(width: max(0, filledWidth), height: trackHeight)
                Circle().fill(Color.white).frame(width: thumbSize, height: thumbSize)
                    .shadow(color: .black.opacity(0.3), radius: 2, y: 1)
                    .offset(x: max(0, min(filledWidth - thumbSize / 2, geo.size.width - thumbSize)))
            }
            // Cible 32pt + highPriorityGesture : le scrub gagne sur le pan du
            // pager de la galerie (sinon le glissement gauche-droite ne bouge
            // pas la barre — cf. bug user).
            .frame(maxHeight: .infinity)
            .contentShape(Rectangle())
            .highPriorityGesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { value in
                        isSeeking = true
                        seekValue = max(0, min(1, value.location.x / geo.size.width))
                    }
                    .onEnded { value in
                        let fraction = max(0, min(1, value.location.x / geo.size.width))
                        manager.seek(to: fraction * manager.duration)
                        isSeeking = false
                        seekValue = 0
                    }
            )
        }
        .frame(height: 32)
    }

    private var speedRow: some View {
        HStack(spacing: 8) {
            ForEach(speeds, id: \.rawValue) { speed in speedChip(speed) }
        }
        .animation(.spring(response: 0.32, dampingFraction: 0.7), value: manager.playbackSpeed)
    }

    private func speedChip(_ speed: PlaybackSpeed) -> some View {
        let isActive = manager.playbackSpeed == speed
        return Button {
            manager.setSpeed(speed)
            HapticFeedback.light()
        } label: {
            Text(speed.label)
                .font(.system(size: 12, weight: .bold, design: .monospaced))
                .foregroundColor(isActive ? .white : .white.opacity(0.7))
                .padding(.horizontal, 12)
                .padding(.vertical, 7)
                .background(Capsule().fill(isActive ? accent : Color.white.opacity(0.15)))
                .overlay(Capsule().stroke(isActive ? Color.white.opacity(0.35) : Color.clear, lineWidth: 0.8))
                .shadow(color: isActive ? accent.opacity(0.5) : .clear, radius: 8, y: 2)
                .scaleEffect(isActive ? 1.08 : 1.0)
        }
    }
}

private struct BouncyTransportButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.86 : 1.0)
            .opacity(configuration.isPressed ? 0.85 : 1.0)
            .animation(.spring(response: 0.28, dampingFraction: 0.55), value: configuration.isPressed)
    }
}
