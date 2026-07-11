import SwiftUI
import AVKit

// MARK: - Shared Video Transport Controls
//
// Composant PUBLIC réutilisable des contrôles de transport vidéo. Piloté par
// `SharedAVPlayerManager` + une `ControlSet` + une couleur d'accent.
//
// Lifting Liquid Glass 2026-07-11 (spec docs/superpowers/specs/
// 2026-07-11-video-player-liquid-glass-lifting-design.md) : centre
// ⏪10 · ▶︎/⏸ · ⏩10 en `.adaptiveGlass` dans un `AdaptiveGlassContainer`,
// et UNE seule barre capsule en bas (temps · scrubber · durée · mute ·
// AirPlay · menu ⋯). Le menu ⋯ regroupe vitesse / boucle / PiP — la
// répartition barre/menu est la fonction pure `TransportLayout`. Avant :
// 4 rangées empilées (mini-toolbar, seek, timecodes, chips vitesse).
//
// Utilisé par la galerie média conversation (`ConversationMediaGalleryView`)
// et par `_FullscreenOverlayControls` ; seul `_InlineOverlayControls`
// (variante compacte distincte) garde sa propre copie.
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

    private var hasBottomBar: Bool {
        controls.contains(.scrubber) || controls.contains(.duration)
            || !TransportLayout.barItems(for: controls).isEmpty
            || TransportLayout.showsMenuButton(for: controls)
    }

    public var body: some View {
        VStack(spacing: 0) {
            Spacer()
            centerControls
            Spacer()
            if hasBottomBar {
                bottomBar.padding(.horizontal, 16)
            }
        }
        .buttonStyle(BouncyTransportButtonStyle())
    }

    // MARK: - Centre (⏪10 · ▶︎/⏸ · ⏩10) — Liquid Glass

    private var centerControls: some View {
        AdaptiveGlassContainer(spacing: 32) {
            HStack(spacing: 32) {
                if controls.contains(.scrubber) { skipButton(systemName: "gobackward.10", seconds: -10) }
                if controls.contains(.playPause) { playPauseButton }
                if controls.contains(.scrubber) { skipButton(systemName: "goforward.10", seconds: 10) }
            }
        }
    }

    private func skipButton(systemName: String, seconds: Double) -> some View {
        Button {
            manager.skip(seconds: seconds)
            HapticFeedback.light()
        } label: {
            // Glyphe figé : contrôle circulaire de taille fixe (52pt).
            // Glass appliqué APRÈS le sizing (règle AdaptiveGlass).
            Image(systemName: systemName)
                .font(.system(size: 22, weight: .semibold))
                .foregroundColor(.white)
                .frame(width: 52, height: 52)
                .adaptiveGlass(in: Circle(), interactive: true)
        }
        .accessibilityLabel(seconds < 0 ? "Reculer de 10 secondes" : "Avancer de 10 secondes")
    }

    private var playPauseButton: some View {
        Button {
            manager.togglePlayPause()
            HapticFeedback.light()
        } label: {
            Image(systemName: manager.isPlaying ? "pause.fill" : "play.fill")
                .font(.system(size: 28, weight: .bold))
                .foregroundColor(.white)
                .offset(x: manager.isPlaying ? 0 : 2)
                .adaptiveSymbolReplace(id: manager.isPlaying)
                .frame(width: 64, height: 64)
                .adaptiveGlassProminent(in: Circle(), tint: accent.opacity(0.85))
        }
        .accessibilityLabel(manager.isPlaying ? "Pause" : "Play")
    }

    // MARK: - Barre unique bas : temps · scrubber · durée · mute · airplay · ⋯

    private var bottomBar: some View {
        HStack(spacing: 10) {
            if controls.contains(.duration) {
                timeLabel(isSeeking ? seekValue * manager.duration : manager.currentTime)
            }
            if controls.contains(.scrubber) { seekBar }
            if controls.contains(.duration) {
                timeLabel(manager.duration)
            }
            ForEach(TransportLayout.barItems(for: controls), id: \.self) { item in
                switch item {
                case .mute: muteButton
                case .airplay: airplayButton
                }
            }
            if TransportLayout.showsMenuButton(for: controls) { moreMenu }
        }
        .padding(.horizontal, 14)
        .frame(height: 48)
        .adaptiveGlass(in: Capsule())
    }

    private func timeLabel(_ seconds: Double) -> some View {
        Text(formatMediaDuration(seconds))
            .font(.system(size: 12, weight: .semibold, design: .monospaced))
            .foregroundColor(.white.opacity(0.85))
            .lineLimit(1)
            .fixedSize()
    }

    private var muteButton: some View {
        Button {
            manager.isMuted.toggle()
            HapticFeedback.light()
        } label: {
            Image(systemName: manager.isMuted ? "speaker.slash.fill" : "speaker.wave.2.fill")
                .font(.system(size: 14, weight: .semibold))
                .foregroundColor(manager.isMuted ? accent : .white)
                .frame(width: 32, height: 32)
                .contentShape(Circle())
        }
        .accessibilityLabel(manager.isMuted ? "Réactiver le son" : "Couper le son")
    }

    private var airplayButton: some View {
        AirPlayRoutePicker(tintColor: .white)
            .frame(width: 32, height: 32)
            .accessibilityLabel("AirPlay")
    }

    private var moreMenu: some View {
        Menu {
            if TransportLayout.menuItems(for: controls).contains(.speed) {
                Picker("Vitesse", selection: Binding(
                    get: { manager.playbackSpeed },
                    set: { manager.setSpeed($0) }
                )) {
                    ForEach(speeds, id: \.rawValue) { speed in
                        Text(speed.label).tag(speed)
                    }
                }
            }
            if TransportLayout.menuItems(for: controls).contains(.loop) {
                Toggle(isOn: $manager.shouldLoop) {
                    Label("Boucle", systemImage: "repeat")
                }
            }
            if TransportLayout.menuItems(for: controls).contains(.pip) {
                Button {
                    if manager.isPipActive { manager.stopPip() } else { manager.startPip() }
                } label: {
                    Label(
                        manager.isPipActive ? "Quitter le Picture in Picture" : "Picture in Picture",
                        systemImage: manager.isPipActive ? "pip.exit" : "pip.enter"
                    )
                }
                .disabled(!AVPictureInPictureController.isPictureInPictureSupported())
            }
        } label: {
            Image(systemName: "ellipsis")
                .font(.system(size: 15, weight: .semibold))
                .foregroundColor(.white)
                .frame(width: 32, height: 32)
                .contentShape(Circle())
        }
        .accessibilityLabel("Plus d'options")
    }

    // MARK: - Seek bar (highPriorityGesture conservé — fix pager historique)

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
            // Cible pleine hauteur + highPriorityGesture : le scrub gagne sur
            // le pan du pager de la galerie (sinon le glissement gauche-droite
            // ne bouge pas la barre — cf. bug user).
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
        .frame(maxWidth: .infinity)
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
