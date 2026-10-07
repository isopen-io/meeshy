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

    /// `@GestureState` (pas `@State`) : remis à `false` automatiquement par
    /// SwiftUI si le drag est interrompu, même sans `.onEnded` — voir la
    /// même règle documentée sur `AudioPlayerView.isUserScrubbing`, qui
    /// publie dans la même `MediaScrubbingPreferenceKey`.
    @GestureState private var isSeeking = false
    @State private var seekValue: Double = 0

    private var accent: Color { Color(hex: accentColor) }

    private var progress: Double {
        guard manager.duration > 0 else { return 0 }
        return isSeeking ? seekValue : manager.currentTime / manager.duration
    }

    /// Décision pure extraite pour la testabilité — `_InlineOverlayControls`
    /// est une `View` SwiftUI, pas un point d'entrée décidable en soi. Même
    /// pattern que `_InlineRenderer.shouldAutoplayOnAppear`. `isPipSupported`
    /// est injecté : le body passe
    /// `AVPictureInPictureController.isPictureInPictureSupported()`, donc le
    /// test ne dépend jamais de l'environnement (faux en CI/simulateur).
    nonisolated static func showsPipButton(controls: MeeshyVideoPlayer.ControlSet, isPipSupported: Bool) -> Bool {
        controls.contains(.pip) && isPipSupported
    }

    /// Les sauts ±10 s suivent le jeu de contrôles, comme tous les autres
    /// boutons de cet overlay (#8231).
    nonisolated static func showsSkipButtons(controls: MeeshyVideoPlayer.ControlSet) -> Bool {
        controls.contains(.skip)
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
            .padding(.horizontal, MeeshySpacing.sm)
            .padding(.top, MeeshySpacing.xsPlus)
            .padding(.bottom, MeeshySpacing.sm)
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

    // MARK: - Top Bar (agrandir à gauche · PiP + AirPlay + vitesse + son à droite)
    //
    // **Agrandir au bord GAUCHE, le son au bord DROIT** (#9575, directive
    // porteur 2026-10-07). Le groupe centré du 2026-08-10 posait les deux
    // contrôles les plus touchés au milieu de l'image ; chacun a maintenant son
    // coin, et les autres (PiP, AirPlay, vitesse) restent groupés à droite,
    // AVANT le son. La répartition est la fonction pure `topBarLayout` ; ce
    // corps ne fait que la peindre. Boutons 28×28 INCHANGÉS (taille inline).
    // Le PiP est MASQUÉ (pas désactivé) hors support device.

    nonisolated enum TopBarItem: Hashable, Sendable {
        case expand, pip, airplay, speed, mute
    }

    nonisolated struct TopBarLayout: Equatable, Sendable {
        let leading: [TopBarItem]
        let trailing: [TopBarItem]
    }

    nonisolated static func topBarLayout(controls: MeeshyVideoPlayer.ControlSet,
                                         hasExpandHandler: Bool,
                                         isPipSupported: Bool) -> TopBarLayout {
        var leading: [TopBarItem] = []
        if controls.contains(.expand), hasExpandHandler { leading.append(.expand) }
        var trailing: [TopBarItem] = []
        if showsPipButton(controls: controls, isPipSupported: isPipSupported) { trailing.append(.pip) }
        if controls.contains(.airplay) { trailing.append(.airplay) }
        if controls.contains(.speed) { trailing.append(.speed) }
        // S2, exigence produit 2026-08-22 (« reels ET vidéos de post ») : sans
        // ce cas, un appelant `.inline` qui demandait `.mute` n'obtenait
        // silencieusement AUCUN bouton.
        if controls.contains(.mute) {
            trailing.append(.mute)
        }
        return TopBarLayout(leading: leading, trailing: trailing)
    }

    private var topBar: some View {
        let layout = Self.topBarLayout(
            controls: controls,
            hasExpandHandler: onExpand != nil,
            isPipSupported: AVPictureInPictureController.isPictureInPictureSupported())
        return HStack(spacing: MeeshySpacing.smPlus) {
            topBarCluster(layout.leading)
            Spacer(minLength: MeeshySpacing.smPlus)
            topBarCluster(layout.trailing)
        }
        .frame(maxWidth: .infinity)
    }

    @ViewBuilder
    private func topBarCluster(_ items: [TopBarItem]) -> some View {
        if !items.isEmpty {
            AdaptiveGlassContainer(spacing: 10) {
                HStack(spacing: MeeshySpacing.smPlus) {
                    ForEach(items, id: \.self) { item in
                        topBarButton(item)
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func topBarButton(_ item: TopBarItem) -> some View {
        switch item {
        case .expand:
            Button {
                onExpand?()
                HapticFeedback.light()
            } label: {
                topBarGlyph("arrow.up.left.and.arrow.down.right")
            }
            .accessibilityLabel(String(localized: "media.video.expand", defaultValue: "Plein écran", bundle: .module))
        case .pip:
            Button {
                if manager.isPipActive {
                    manager.stopPip()
                } else {
                    manager.startPip()
                }
                HapticFeedback.light()
            } label: {
                topBarGlyph(manager.isPipActive ? "pip.exit" : "pip.enter")
            }
            .accessibilityLabel(manager.isPipActive
                ? String(localized: "media.video.pip.exit", defaultValue: "Quitter le Picture in Picture", bundle: .module)
                : String(localized: "media.video.pip.enter", defaultValue: "Picture in Picture", bundle: .module))
        case .airplay:
            AirPlayRoutePicker(tintColor: .white)
                .frame(width: 28, height: 28)
                .accessibilityLabel(String(localized: "media.video.airplay", defaultValue: "AirPlay", bundle: .module))
        case .speed:
            Button {
                manager.cycleSpeed()
                HapticFeedback.light()
            } label: {
                Text(manager.playbackSpeed.label)
                    .font(.system(size: MeeshyFont.footnoteSize, weight: .bold, design: .monospaced))
                    .foregroundColor(.white)
                    .padding(.horizontal, MeeshySpacing.sm)
                    .padding(.vertical, MeeshySpacing.xs)
                    .adaptiveGlass(in: Capsule())
            }
        case .mute:
            // Réutilise EXACTEMENT le même toggle/icônes/clés que
            // `VideoTransportControls` — un seul jeu d'icônes, aucune clé neuve.
            Button {
                manager.isMuted.toggle()
                HapticFeedback.light()
            } label: {
                topBarGlyph(manager.isMuted ? "speaker.slash.fill" : "speaker.wave.2.fill")
            }
            .accessibilityLabel(manager.isMuted
                ? String(localized: "media.video.unmute", defaultValue: "Réactiver le son", bundle: .module)
                : String(localized: "media.video.mute", defaultValue: "Couper le son", bundle: .module))
        }
    }

    private func topBarGlyph(_ systemName: String) -> some View {
        Image(systemName: systemName)
            .font(.system(size: MeeshyIconSize.xs, weight: .semibold))
            .foregroundColor(.white)
            .frame(width: 28, height: 28)
            .adaptiveGlass(in: Circle(), interactive: true)
    }

    // MARK: - Center Controls (skip + play/pause)
    //
    // Hiérarchie visuelle : skip 36 ←→ play 54 (ratio 0.67) — le play domine
    // clairement, tailles INCHANGÉES (l'inline reste plus compact que le
    // plein écran 52/64pt, `VideoTransportControls.swift:87/105`). Lifting
    // Liquid Glass 2026-08-11 (§ C) : migré vers
    // `.adaptiveGlass`/`.adaptiveGlassProminent` sous `AdaptiveGlassContainer`
    // — le double-fill `ultraThinMaterial` + `accent.opacity` + le stroke
    // manuel disparaissent au profit des deux primitives partagées, comme
    // `VideoTransportControls.centerControls`.

    private var centerControls: some View {
        AdaptiveGlassContainer(spacing: 24) {
            HStack(spacing: MeeshySpacing.xxl) {
                if Self.showsSkipButtons(controls: controls) {
                    skipButton(systemName: "gobackward.10", seconds: -10)
                }
                playPauseButton
                if Self.showsSkipButtons(controls: controls) {
                    skipButton(systemName: "goforward.10", seconds: 10)
                }
            }
        }
    }

    private func skipButton(systemName: String, seconds: Double) -> some View {
        Button {
            manager.skip(seconds: seconds)
            HapticFeedback.light()
        } label: {
            Image(systemName: systemName)
                .font(.system(size: MeeshyIconSize.lg, weight: .semibold))
                .foregroundColor(.white)
                .frame(width: 36, height: 36)
                .adaptiveGlass(in: Circle(), interactive: true)
        }
    }

    private var playPauseButton: some View {
        Button {
            manager.togglePlayPause()
            HapticFeedback.light()
        } label: {
            playPauseIcon
                .frame(width: 54, height: 54)
                .adaptiveGlassProminent(in: Circle(), tint: accent.opacity(0.85))
        }
        .accessibilityLabel(manager.isPlaying
            ? String(localized: "media.video.pause", defaultValue: "Pause", bundle: .module)
            : String(localized: "media.video.play", defaultValue: "Lire la vidéo", bundle: .module))
    }

    /// Cross-fade entre `play.fill` et `pause.fill`. Gestion versionnée
    /// déléguée à `adaptiveSymbolReplace` (cf. `Compatibility/AdaptiveSymbolEffects`).
    private var playPauseIcon: some View {
        Image(systemName: manager.isPlaying ? "pause.fill" : "play.fill")
            .font(.system(size: MeeshyIconSize.xxl, weight: .bold))
            .foregroundColor(.white)
            .offset(x: manager.isPlaying ? 0 : 2)
            .adaptiveSymbolReplace(id: manager.isPlaying)
    }

    // MARK: - Bottom Bar (seek + time)

    private var bottomBar: some View {
        VStack(spacing: MeeshySpacing.xs) {
            if controls.contains(.scrubber) {
                seekBar
            }
            if controls.contains(.duration) {
                HStack {
                    Text(formatMediaDuration(isSeeking ? seekValue * manager.duration : manager.currentTime))
                        .font(.system(size: MeeshyFont.microSize, weight: .semibold, design: .monospaced))
                        .foregroundColor(.white.opacity(0.8))
                    Spacer()
                    Text(formatMediaDuration(manager.duration))
                        .font(.system(size: MeeshyFont.microSize, weight: .semibold, design: .monospaced))
                        .foregroundColor(.white.opacity(0.8))
                }
                .padding(.horizontal, MeeshySpacing.xxs)
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
                    .updating($isSeeking) { _, state, _ in
                        state = true
                    }
                    .onChanged { value in
                        // L'image suit le doigt : déplacement TOLÉRANT pendant
                        // le geste (image-clé la plus proche, coalescé par
                        // `SharedAVPlayerManager`). Même correction que la barre
                        // du couloir — jusqu'ici seule la pastille bougeait,
                        // au-dessus d'une image figée. Directive « gestes
                        // progressifs et annulables » (2026-08-30).
                        let fraction = max(0, min(1, value.location.x / geo.size.width))
                        seekValue = fraction
                        manager.seek(to: fraction * manager.duration, precise: false)
                    }
                    .onEnded { value in
                        // CONCLUT sur la frame exacte ; ne décide plus.
                        let fraction = max(0, min(1, value.location.x / geo.size.width))
                        manager.seek(to: fraction * manager.duration, precise: true)
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
            FullscreenScrims(topInset: WindowMetrics.safeAreaInsets.top, chromeVisible: true)
            VStack(spacing: 0) {
                topBar
                    .padding(.top, FullscreenChromeMetrics.topInset)
                    .padding(.horizontal, FullscreenTopBarLayout.horizontalPadding)
                // Transport délégué au composant partagé `VideoTransportControls`
                // (source unique, idem galerie média) — dédup des ~240 lignes qui
                // dupliquaient center/seek/speed/mini-toolbar. La top bar fichier
                // (close/save/share) reste propre au fullscreen.
                VideoTransportControls(manager: manager, accentColor: accentColor, controls: controls)
                    .padding(.bottom, MeeshySpacing.lg)
            }
        }
        .buttonStyle(BouncyControlButtonStyle())
    }

    private var topBar: some View {
        HStack(spacing: FullscreenChromeMetrics.barSpacing) {
            if controls.contains(.close) {
                FullscreenCloseButton { onClose?() }
            }
            if let fileName, !fileName.isEmpty {
                Text(fileName)
                    .font(.system(size: MeeshyFont.labelSize, weight: .semibold))
                    .foregroundColor(MeeshyColors.mediaChromeSecondary)
                    .lineLimit(1)
                    .truncationMode(.middle)
            }
            Spacer()
            if controls.contains(.share), onShare != nil {
                FullscreenChromeButton(
                    systemImage: FullscreenChromeSymbol.share,
                    label: String(localized: "story.timeline.export.preview.share",
                                  defaultValue: "Partager la vidéo", bundle: .module)
                ) {
                    onShare?()
                }
            }
            if controls.contains(.save) {
                saveButton
            }
        }
    }

    @ViewBuilder
    private var saveButton: some View {
        if saveState == .saving {
            ProgressView()
                .tint(MeeshyColors.mediaChromeForeground)
                .frame(width: FullscreenChromeMetrics.tapTarget,
                       height: FullscreenChromeMetrics.tapTarget)
        } else {
            FullscreenChromeButton(
                systemImage: saveGlyph,
                label: String(localized: "common.save", defaultValue: "Enregistrer", bundle: .module)
            ) {
                onSave?()
            }
            .disabled(saveState == .saved)
        }
    }

    private var saveGlyph: String {
        switch saveState {
        case .idle, .saving: return FullscreenChromeSymbol.save
        case .saved: return FullscreenChromeSymbol.saved
        case .failed: return FullscreenChromeSymbol.close
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
