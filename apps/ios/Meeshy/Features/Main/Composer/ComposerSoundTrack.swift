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

/// **Le bouton muet, à DROITE de la barre de trim** (#9754) : il coupe tout le
/// son de la prise, ou le réactive au gain d'avant. Rebondit au toucher.
struct ComposerTakeMuteButton: View {
    let muted: Bool
    let onToggle: () -> Void

    var body: some View {
        Button(action: onToggle) {
            Image(systemName: muted ? "speaker.slash.fill" : "speaker.wave.2.fill")
                .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                .foregroundStyle(muted ? MeeshyColors.error : .white)
                .frame(width: 40, height: 40)
                .adaptiveLiquidGlass(in: Circle(), interactive: true)
                .frame(width: MeeshyControlSize.tapTarget, height: MeeshyControlSize.tapTarget)
                .contentShape(Circle())
        }
        .buttonStyle(ComposerBounceButtonStyle())
        .accessibilityLabel(ComposerCaptureCopy.muteLabel(muted: muted))
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

    private static let height: CGFloat = ComposerTrimTrack.height
    private static let samplesCount = 256

    @State private var samples: [Float] = []

    private var sound: ComposerTakeSound { session.takeSound }

    var body: some View {
        GeometryReader { proxy in
            let largeur = proxy.size.width
            ZStack(alignment: .topLeading) {
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .fill(Color.white.opacity(0.1))
                spectrum(width: largeur)
                volumeLine(width: largeur)
            }
            .frame(width: largeur, height: Self.height)
            .contentShape(Rectangle())
            .gesture(DragGesture(minimumDistance: 0).onChanged { valeur in
                session.setTakeGain(ComposerTakeSound.gain(atY: valeur.location.y, height: Self.height))
            })
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

    /// Les barres du spectre, centrées, à la hauteur du gain servi.
    private func spectrum(width: CGFloat) -> some View {
        let releve = samples
        let echelle = CGFloat(sound.effectiveGain)
        return Path { chemin in
            guard !releve.isEmpty else { return }
            let pas = width / CGFloat(releve.count)
            for (index, valeur) in releve.enumerated() {
                let hauteur = max(2, CGFloat(valeur) * Self.height * echelle)
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
