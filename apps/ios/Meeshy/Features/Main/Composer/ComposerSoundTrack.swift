import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Les mots des outils de la retouche (#9754)

extension ComposerCaptureCopy {
    static func editToolName(_ tool: ComposerEditTool) -> String {
        switch tool {
        case .crop: return reframe
        case .trim:
            return String(localized: "composer.capture.tool.trim", defaultValue: "Couper", bundle: .main)
        case .sound:
            return String(localized: "composer.capture.tool.sound", defaultValue: "Son", bundle: .main)
        }
    }

    static func editToolSymbol(_ tool: ComposerEditTool) -> String {
        switch tool {
        case .crop: return "crop"
        case .trim: return "scissors"
        case .sound: return "waveform"
        }
    }

    /// Ce qu'un outil fait paraître est affiché, ou masqué.
    static var toolShown: String {
        String(localized: "composer.capture.tool.shown", defaultValue: "Affiché", bundle: .main)
    }

    static var toolHidden: String {
        String(localized: "composer.capture.tool.hidden", defaultValue: "Masqué", bundle: .main)
    }

    /// Le libellé dit l'ACTION du bouton muet.
    static func muteLabel(muted: Bool) -> String {
        muted
            ? String(localized: "composer.capture.sound.unmute", defaultValue: "Réactiver le son", bundle: .main)
            : String(localized: "composer.capture.sound.mute", defaultValue: "Couper le son", bundle: .main)
    }

    static var volume: String {
        String(localized: "composer.capture.sound.volume", defaultValue: "Volume", bundle: .main)
    }

    static func volumeValue(_ sound: ComposerTakeSound) -> String {
        guard !sound.muted else { return muteLabel(muted: false) }
        return (Double(ComposerTakeSound.percent(sound.gain)) / 100).formatted(.percent.precision(.fractionLength(0)))
    }
}

/// **La lecture et le volume, en haut à droite, sous « Terminé »** (porteur
/// 2026-10-20 : « le bouton play/pause et volume faut mettre en haut du cadre
/// en dessous de Terminé […] toujours visibles »). La pause à gauche, le
/// volume à droite, sur une bande à eux : posés au coin bas de la scène, ils
/// tombaient sur le rail des outils dès que la vidéo occupait l'écran — et une
/// scène recadrée commence sous cette bande, ses crochets restent libres.
nonisolated enum ComposerEditPlaybackLayout {
    static let spacing: CGFloat = MeeshySpacing.xs
    static let margin: CGFloat = MeeshySpacing.sm

    /// La hauteur que la bande retient sous la rangée haute.
    static var band: CGFloat { MeeshyControlSize.tapTarget + ComposerEditScene.gap }

    static func buttonCount(hasAudio: Bool) -> Int {
        hasAudio ? 2 : 1
    }

    static func frame(container: CGSize, hasAudio: Bool) -> CGRect {
        let cote = MeeshyControlSize.tapTarget
        let nombre = CGFloat(buttonCount(hasAudio: hasAudio))
        let largeur = nombre * cote + (nombre - 1) * spacing
        return CGRect(x: container.width - ComposerEditScene.margin - largeur, y: ComposerEditScene.topBand,
                      width: largeur, height: cote)
    }
}

extension ComposerCaptureCopy {
    /// Le libellé dit l'ACTION du bouton : « Lire » en pause, « Pause » sinon.
    static func playbackLabel(paused: Bool) -> String {
        paused
            ? String(localized: "composer.frise.play", defaultValue: "Lire", bundle: .main)
            : String(localized: "composer.frise.pause", defaultValue: "Pause", bundle: .main)
    }
}

/// Les deux boutons posés sur la vidéo : glyphes BLANCS en relief par leur
/// ombre, cible de 44 pt, rebond au toucher. Le muet n'existe que si la prise
/// porte un son.
struct ComposerEditPlaybackControls: View {
    let paused: Bool
    let hasAudio: Bool
    let muted: Bool
    let onTogglePlayback: () -> Void
    let onToggleMute: () -> Void

    var body: some View {
        HStack(spacing: ComposerEditPlaybackLayout.spacing) {
            glyphButton(paused ? "play.fill" : "pause.fill",
                        label: ComposerCaptureCopy.playbackLabel(paused: paused),
                        action: onTogglePlayback)
            if hasAudio {
                glyphButton(muted ? "speaker.slash.fill" : "speaker.wave.2.fill",
                            label: ComposerCaptureCopy.muteLabel(muted: muted),
                            action: onToggleMute)
            }
        }
        .environment(\.layoutDirection, .leftToRight)
    }

    private func glyphButton(_ symbol: String, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.title3.weight(.semibold))
                .foregroundStyle(.white)
                .shadow(color: .black.opacity(ComposerFloatingRailInk.shadowOpacity),
                        radius: ComposerFloatingRailInk.shadowRadius,
                        y: ComposerFloatingRailInk.shadowY)
                .frame(width: MeeshyControlSize.tapTarget, height: MeeshyControlSize.tapTarget)
                .contentShape(Rectangle())
        }
        .buttonStyle(ComposerBounceButtonStyle())
        .accessibilityLabel(label)
    }
}

/// **Le son de la prise, en couleur** (#9754 : « fait apparaître en couleur le
/// spectre vocal et une ligne de volume permettant d'augmenter ou de baisser le
/// volume sonore »). Le spectre se peint à la hauteur du gain qu'on entendra ;
/// la ligne se tire de haut en bas — en haut le plein, en bas le silence. Muet,
/// le spectre s'éteint et la ligne repose au sol. VoiceOver règle le volume
/// d'un balayage. Le temps ne se met pas en miroir.
struct ComposerSoundTrack: View {
    @ObservedObject var session: ComposerCaptureSession
    let url: URL
    /// **Posé PAR-DESSUS la bande vidéo** (porteur 2026-10-12, #10341) : pas de
    /// fond, le spectre en transparence, la ligne de volume tirée par sa seule
    /// prise — le reste de la bande garde ses gestes. Le bouton du son se pose
    /// à côté, par l'hôte, au bord droit intérieur avant la poignée.
    var overlaid = false

    private static let height: CGFloat = ComposerTrimTrack.height
    private static let samplesCount = 256

    @State private var samples: [Float] = []

    private var sound: ComposerTakeSound { session.takeSound }

    var body: some View {
        GeometryReader { proxy in
            let largeur = proxy.size.width
            ZStack(alignment: .topLeading) {
                if !overlaid {
                    RoundedRectangle(cornerRadius: MeeshyRadius.sm, style: .continuous)
                        .fill(Color.white.opacity(0.1))
                }
                spectrum(width: largeur)
                    .opacity(overlaid ? 0.75 : 1)
                    .allowsHitTesting(false)
                volumeLine(width: largeur)
                if overlaid { volumeGrip }
            }
            .frame(width: largeur, height: Self.height)
            .coordinateSpace(name: Self.space)
            .contentShape(Rectangle())
            .gesture(volumeDrag, including: overlaid ? .subviews : .all)
        }
        .frame(height: Self.height)
        .environment(\.layoutDirection, .leftToRight)
        .accessibilityElement()
        .accessibilityLabel(ComposerCaptureCopy.volume)
        .accessibilityValue(ComposerCaptureCopy.volumeValue(sound))
        .accessibilityAdjustableAction { sens in
            switch sens {
            case .increment: session.setTakeGain(ComposerTakeSound.stepped(sound.gain, up: true))
            case .decrement: session.setTakeGain(ComposerTakeSound.stepped(sound.gain, up: false))
            @unknown default: break
            }
        }
        .task(id: url) { @MainActor in
            samples = (try? await WaveformCache.shared.samples(from: url, count: Self.samplesCount)) ?? []
        }
    }

    private static let space = "composer.capture.sound"

    private var volumeDrag: some Gesture {
        DragGesture(minimumDistance: 0, coordinateSpace: .named(Self.space)).onChanged { valeur in
            session.setTakeGain(ComposerTakeSound.gain(atY: valeur.location.y, height: Self.height))
        }
    }

    /// La prise de la ligne, seule à se tirer quand la piste est posée sur la vidéo.
    private var volumeGrip: some View {
        let y = ComposerTakeSound.lineY(gain: Double(sound.effectiveGain), height: Self.height)
        return Color.clear
            .frame(width: MeeshyControlSize.tapTarget, height: MeeshyControlSize.tapTarget)
            .contentShape(Rectangle())
            .offset(x: -MeeshyControlSize.tapTarget / 4, y: y - MeeshyControlSize.tapTarget / 2)
            .gesture(volumeDrag)
    }

    /// Les barres du spectre, centrées, à la hauteur du gain servi.
    private func spectrum(width: CGFloat) -> some View {
        let releve = samples
        let echelle = CGFloat(sound.effectiveGain)
        return Path { chemin in
            guard !releve.isEmpty else { return }
            let pas = width / CGFloat(releve.count)
            for (index, valeur) in releve.enumerated() {
                let hauteur = max(2, CGFloat(WaveformScale.displayHeight(rms: valeur)) * Self.height * echelle)
                chemin.addRect(CGRect(x: CGFloat(index) * pas, y: (Self.height - hauteur) / 2,
                                      width: max(1, pas - 1), height: hauteur))
            }
        }
        .fill(sound.muted
              ? AnyShapeStyle(Color.white.opacity(0.25))
              : AnyShapeStyle(LinearGradient(colors: [MeeshyColors.indigo400, MeeshyColors.purple500,
                                                      MeeshyColors.warning],
                                             startPoint: .leading, endPoint: .trailing)))
        .frame(width: width, height: Self.height)
        .accessibilityHidden(true)
    }

    /// La ligne de volume, avec sa prise à gauche.
    private func volumeLine(width: CGFloat) -> some View {
        let y = ComposerTakeSound.lineY(gain: Double(sound.effectiveGain), height: Self.height)
        return ZStack(alignment: .leading) {
            Capsule().fill(Color.white).frame(width: width, height: 2)
            Circle().fill(Color.white).frame(width: 14, height: 14)
                .shadow(color: .black.opacity(0.35), radius: 2, y: 1)
        }
        .offset(y: min(max(0, y - 7), Self.height - 14))
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}
