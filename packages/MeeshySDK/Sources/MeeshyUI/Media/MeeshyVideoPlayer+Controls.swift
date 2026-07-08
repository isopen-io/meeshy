import SwiftUI
import AVFoundation
import AVKit
import Combine

// MARK: - Layered Overlay Controls (inline)
//
// Legacy `VideoPlayerOverlayControls` style : scrim top + scrim bottom,
// top bar (expand + speed), big center play/pause + skip ±10s, bottom
// custom seek bar + time current/total. All controls drawn ON the video,
// transparent — never a separate capsule under it.

internal struct _InlineOverlayControls: View {
    @ObservedObject var manager: SharedAVPlayerManager
    let accentColor: String
    let controls: MeeshyVideoPlayer.ControlSet
    let onExpand: (() -> Void)?

    @State private var isSeeking = false
    @State private var seekValue: Double = 0

    private var accent: Color { Color(hex: accentColor) }

    private var progress: Double {
        guard manager.duration > 0 else { return 0 }
        return isSeeking ? seekValue : manager.currentTime / manager.duration
    }

    var body: some View {
        ZStack {
            scrimGradients
            VStack {
                topBar
                Spacer()
                centerControls
                Spacer()
                bottomBar
            }
            .padding(.horizontal, 8)
            .padding(.top, 6)
            .padding(.bottom, 8)
        }
        .buttonStyle(BouncyControlButtonStyle())
        .allowsHitTesting(true)
        // Signale le scrub en cours à l'hôte (voir MediaScrubbingPreferenceKey) :
        // le conteneur de swipe de la bulle désengage reply/forward tant que le
        // doigt manipule la seek bar.
        .preference(key: MediaScrubbingPreferenceKey.self, value: isSeeking)
    }

    // MARK: - Scrim

    private var scrimGradients: some View {
        VStack {
            LinearGradient(
                colors: [Color.black.opacity(0.55), Color.clear],
                startPoint: .top, endPoint: .bottom
            )
            .frame(height: 50)
            Spacer()
            LinearGradient(
                colors: [Color.clear, Color.black.opacity(0.6)],
                startPoint: .top, endPoint: .bottom
            )
            .frame(height: 60)
        }
        .allowsHitTesting(false)
    }

    // MARK: - Top Bar (expand + speed)

    private var topBar: some View {
        HStack {
            if controls.contains(.expand), let onExpand {
                Button {
                    onExpand()
                    HapticFeedback.light()
                } label: {
                    Image(systemName: "arrow.up.left.and.arrow.down.right")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(.white)
                        .frame(width: 28, height: 28)
                        .background(Circle().fill(Color.white.opacity(0.2)))
                }
            }
            Spacer()
            if controls.contains(.speed) {
                Button {
                    manager.cycleSpeed()
                    HapticFeedback.light()
                } label: {
                    Text(manager.playbackSpeed.label)
                        .font(.system(size: 11, weight: .bold, design: .monospaced))
                        .foregroundColor(.white)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Capsule().fill(accent))
                }
            }
        }
    }

    // MARK: - Center Controls (skip + play/pause)
    //
    // Hierarchy visuelle : skip 36 ←→ play 54 (ratio 0.67) — le play domine
    // clairement. Glass UI + accent tinté homogène à 0.3 sur tous les
    // boutons. Le play porte une teinte d'accent plus marquée (0.55) pour
    // tirer l'œil dessus.

    private var centerControls: some View {
        HStack(spacing: 24) {
            skipButton(systemName: "gobackward.10", seconds: -10)
            playPauseButton
            skipButton(systemName: "goforward.10", seconds: 10)
        }
    }

    private func skipButton(systemName: String, seconds: Double) -> some View {
        Button {
            manager.skip(seconds: seconds)
            HapticFeedback.light()
        } label: {
            Image(systemName: systemName)
                .font(.system(size: 18, weight: .semibold))
                .foregroundColor(.white)
                .frame(width: 36, height: 36)
                .background(
                    ZStack {
                        Circle().fill(.ultraThinMaterial)
                        Circle().fill(accent.opacity(0.30))
                    }
                )
                .overlay(Circle().stroke(Color.white.opacity(0.10), lineWidth: 0.5))
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
                playPauseIcon
            }
            .frame(width: 54, height: 54)
            .overlay(Circle().stroke(Color.white.opacity(0.18), lineWidth: 0.5))
            .shadow(color: accent.opacity(0.35), radius: 10, y: 3)
        }
        .accessibilityLabel(manager.isPlaying ? "Pause" : "Play")
    }

    /// Cross-fade entre `play.fill` et `pause.fill`. Gestion versionnée
    /// déléguée à `adaptiveSymbolReplace` (cf. `Compatibility/AdaptiveSymbolEffects`).
    private var playPauseIcon: some View {
        Image(systemName: manager.isPlaying ? "pause.fill" : "play.fill")
            .font(.system(size: 22, weight: .bold))
            .foregroundColor(.white)
            .offset(x: manager.isPlaying ? 0 : 2)
            .adaptiveSymbolReplace(id: manager.isPlaying)
    }

    // MARK: - Bottom Bar (seek + time)

    private var bottomBar: some View {
        VStack(spacing: 4) {
            if controls.contains(.scrubber) {
                seekBar
            }
            if controls.contains(.duration) {
                HStack {
                    Text(formatMediaDuration(isSeeking ? seekValue * manager.duration : manager.currentTime))
                        .font(.system(size: 9, weight: .semibold, design: .monospaced))
                        .foregroundColor(.white.opacity(0.8))
                    Spacer()
                    Text(formatMediaDuration(manager.duration))
                        .font(.system(size: 9, weight: .semibold, design: .monospaced))
                        .foregroundColor(.white.opacity(0.8))
                }
                .padding(.horizontal, 2)
            }
        }
    }

    // MARK: - Custom Seek Bar (draggable thumb)

    private var seekBar: some View {
        GeometryReader { geo in
            let trackHeight: CGFloat = 3
            let thumbSize: CGFloat = 12
            let filledWidth = geo.size.width * progress

            ZStack(alignment: .leading) {
                Capsule().fill(Color.white.opacity(0.3)).frame(height: trackHeight)
                Capsule().fill(accent).frame(width: max(0, filledWidth), height: trackHeight)
                Circle().fill(Color.white).frame(width: thumbSize, height: thumbSize)
                    .shadow(color: .black.opacity(0.3), radius: 2, y: 1)
                    .offset(x: max(0, min(filledWidth - thumbSize / 2, geo.size.width - thumbSize)))
            }
            // Hit area remplit la hauteur (28pt) tout en gardant la barre fine
            // centrée — une cible 3pt était quasi impossible à saisir au doigt.
            .frame(maxHeight: .infinity)
            .contentShape(Rectangle())
            // `highPriorityGesture` : le scrub gauche-droite doit GAGNER sur le
            // pan du scroll/carousel parent. Avec un simple `.gesture`, la liste
            // de messages captait le glissement horizontal et la barre ne bougeait
            // pas (bug user "ne capture pas en priorité"). minimumDistance:0 =
            // réagit dès le touch pour un positionnement libre immédiat.
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
        .frame(height: 28)
    }
}

// MARK: - Fullscreen Layered Overlay Controls
//
// Bigger taps, filename top bar, large center buttons, speed row + caption
// at the bottom. Drawn ON the video. Used by `_FullscreenRenderer`.

internal struct _FullscreenOverlayControls: View {
    @ObservedObject var manager: SharedAVPlayerManager
    let accentColor: String
    let controls: MeeshyVideoPlayer.ControlSet
    let fileName: String?
    let onClose: (() -> Void)?
    let onSave: (() -> Void)?
    let onShare: (() -> Void)?
    let saveState: _FullscreenRenderer.SaveState

    var body: some View {
        ZStack {
            scrimGradients
            VStack(spacing: 0) {
                topBar
                    .padding(.top, 8)
                    .padding(.horizontal, 16)
                // Transport délégué au composant partagé `VideoTransportControls`
                // (source unique, idem galerie média) — dédup des ~240 lignes qui
                // dupliquaient center/seek/speed/mini-toolbar. La top bar fichier
                // (close/save/share) reste propre au fullscreen.
                VideoTransportControls(manager: manager, accentColor: accentColor, controls: controls)
                    .padding(.bottom, 16)
            }
        }
        .buttonStyle(BouncyControlButtonStyle())
    }

    private var scrimGradients: some View {
        VStack(spacing: 0) {
            LinearGradient(colors: [Color.black.opacity(0.7), Color.clear], startPoint: .top, endPoint: .bottom)
                .frame(height: 80)
            Spacer()
            LinearGradient(colors: [Color.clear, Color.black.opacity(0.7)], startPoint: .top, endPoint: .bottom)
                .frame(height: 180)
        }
        .ignoresSafeArea()
        .allowsHitTesting(false)
    }

    private var topBar: some View {
        HStack(spacing: 12) {
            if controls.contains(.close) {
                Button {
                    onClose?()
                    HapticFeedback.light()
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 16, weight: .bold))
                        .foregroundColor(.white)
                        .frame(width: 36, height: 36)
                        .background(Circle().fill(Color.white.opacity(0.2)))
                }
            }
            if let fileName, !fileName.isEmpty {
                Text(fileName)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(.white.opacity(0.9))
                    .lineLimit(1)
                    .truncationMode(.middle)
            }
            Spacer()
            if controls.contains(.share), onShare != nil {
                Button {
                    onShare?()
                    HapticFeedback.light()
                } label: {
                    Image(systemName: "square.and.arrow.up")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(.white.opacity(0.9))
                        .frame(width: 36, height: 36)
                        .background(Circle().fill(Color.white.opacity(0.2)))
                }
            }
            if controls.contains(.save) {
                Button {
                    onSave?()
                } label: {
                    Group {
                        switch saveState {
                        case .idle:   Image(systemName: "arrow.down.to.line")
                        case .saving: ProgressView().tint(.white)
                        case .saved:  Image(systemName: "checkmark")
                        case .failed: Image(systemName: "xmark")
                        }
                    }
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(.white.opacity(0.9))
                    .frame(width: 36, height: 36)
                    .background(Circle().fill(Color.white.opacity(0.2)))
                }
                .disabled(saveState == .saving || saveState == .saved)
            }
        }
    }

}

// MARK: - Bouncy press feedback (legacy parity)

private struct BouncyControlButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.86 : 1.0)
            .opacity(configuration.isPressed ? 0.85 : 1.0)
            .animation(.spring(response: 0.28, dampingFraction: 0.55), value: configuration.isPressed)
    }
}
