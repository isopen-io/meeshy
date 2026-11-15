import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Le verdict de la couche appareil d'un message hybride, dans le pied**
/// (#14369). Discret quand le texte ORIGINAL est vérifié (un sceau, à côté de
/// l'heure, jamais à côté d'une traduction) ; neutre quand la couche appareil
/// contredit le texte servi : le texte servi reste affiché, aucune faute n'est
/// attribuée, et un toucher dévoile le texte chiffré par l'appareil de
/// l'expéditeur. Un message invérifiable ne montre rien.
struct BubbleDeviceLayerMark: View, Equatable {
    let integrity: HybridDeviceLayerIntegrity
    let isMe: Bool
    let isDark: Bool
    @Environment(\.bubbleSkin) private var skin
    @State private var revealsDeviceText = false

    static func == (lhs: Self, rhs: Self) -> Bool {
        lhs.integrity == rhs.integrity && lhs.isMe == rhs.isMe && lhs.isDark == rhs.isDark
    }

    var body: some View {
        if let glyph = Self.glyph(for: integrity) {
            if let deviceText = integrity.deviceText {
                Button { revealsDeviceText = true } label: { mark(glyph) }
                    .buttonStyle(.plain)
                    .accessibilityHint(Self.revealLabel)
                    .alert(Self.deviceTextTitle, isPresented: $revealsDeviceText) {
                        Button(String(localized: "common.ok", defaultValue: "OK", bundle: .main), role: .cancel) { }
                    } message: {
                        Text(deviceText)
                    }
            } else {
                mark(glyph)
            }
        }
    }

    private func mark(_ glyph: String) -> some View {
        Image(systemName: glyph)
            .font(.system(.caption2, design: .default).weight(.semibold))
            .minimumScaleFactor(0.8)
            .foregroundStyle(tint)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(Self.spokenLabel(for: integrity) ?? "")
    }

    private var tint: Color {
        if case .mismatch(_, false) = integrity { return MeeshyColors.warning }
        return isMe ? skin.ink(MeeshyOpacity.heavy) : MeeshyColors.textMuted(isDark: isDark)
    }

    static func glyph(for integrity: HybridDeviceLayerIntegrity) -> String? {
        switch integrity {
        case .verified: "checkmark.seal"
        case .mismatch(_, false): "exclamationmark.triangle"
        case .mismatch(_, true): "exclamationmark.circle"
        case .unverifiable: nil
        }
    }

    static var revealLabel: String {
        String(localized: "message.deviceLayer.reveal", defaultValue: "Voir le texte de l’appareil", bundle: .main)
    }

    static var deviceTextTitle: String {
        String(localized: "message.deviceLayer.deviceText.title",
               defaultValue: "Texte chiffré par l’appareil de l’expéditeur", bundle: .main)
    }

    /// Ce que le lecteur d'écran dit — le site unique du pied et du compositeur
    /// VoiceOver. Il nomme ce qui est vérifié : le texte ORIGINAL.
    static func spokenLabel(for integrity: HybridDeviceLayerIntegrity?) -> String? {
        switch integrity {
        case .verified:
            String(localized: "message.deviceLayer.verifiedOriginal",
                   defaultValue: "Texte original vérifié par votre appareil : il est identique à celui que l’appareil de l’expéditeur a chiffré.",
                   bundle: .main)
        case .mismatch(_, false):
            String(localized: "message.deviceLayer.mismatchServed",
                   defaultValue: "Le texte reçu ne correspond pas à celui chiffré par l’appareil de l’expéditeur.",
                   bundle: .main)
        case .mismatch(_, true):
            String(localized: "message.deviceLayer.editedUnproven",
                   defaultValue: "Modifié — le texte d’origine chiffré par l’appareil de l’expéditeur est disponible.",
                   bundle: .main)
        case .unverifiable, nil:
            nil
        }
    }
}
