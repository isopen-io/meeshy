import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Le verdict de la couche appareil d'un message hybride, dans le pied**
/// (#14369). Discret quand le texte est vérifié (un sceau, à côté de l'heure) ;
/// lisible quand la couche appareil contredit le texte servi (un triangle de
/// la couleur d'alerte). Un message modifié après l'envoi ne montre rien : son
/// texte n'a plus de couche appareil qui le couvre.
struct BubbleDeviceLayerMark: View, Equatable {
    let integrity: HybridDeviceLayerIntegrity
    let isMe: Bool
    let isDark: Bool
    @Environment(\.bubbleSkin) private var skin

    static func == (lhs: Self, rhs: Self) -> Bool {
        lhs.integrity == rhs.integrity && lhs.isMe == rhs.isMe && lhs.isDark == rhs.isDark
    }

    var body: some View {
        if let glyph = Self.glyph(for: integrity) {
            Image(systemName: glyph)
                .font(.system(.caption2, design: .default).weight(.semibold))
                .minimumScaleFactor(0.8)
                .foregroundStyle(tint)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(Self.spokenLabel(for: integrity) ?? "")
        }
    }

    private var tint: Color {
        if integrity.isMismatch { return MeeshyColors.stateFailed }
        return isMe ? skin.ink(MeeshyOpacity.heavy) : MeeshyColors.textMuted(isDark: isDark)
    }

    static func glyph(for integrity: HybridDeviceLayerIntegrity) -> String? {
        switch integrity {
        case .verified: "checkmark.seal"
        case .mismatch: "exclamationmark.triangle.fill"
        case .unverifiable: nil
        }
    }

    /// Ce que le lecteur d'écran dit — le site unique du pied et du compositeur VoiceOver.
    static func spokenLabel(for integrity: HybridDeviceLayerIntegrity?) -> String? {
        switch integrity {
        case .verified:
            String(localized: "message.deviceLayer.verified",
                   defaultValue: "Vérifié par votre appareil : ce message est arrivé tel que son auteur l’a écrit.", bundle: .main)
        case .mismatch:
            String(localized: "message.deviceLayer.mismatch",
                   defaultValue: "Le texte reçu de nos serveurs ne correspondait pas à celui chiffré par l’appareil de l’auteur : c’est ce dernier qui est affiché.",
                   bundle: .main)
        case .unverifiable, nil:
            nil
        }
    }
}
