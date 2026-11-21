import SwiftUI
import MeeshySDK
import MeeshyUI

/// Ce que fait la personne qui me montre sa position (#19887) : un glyphe sur son épingle et dans sa rangée, et le mot
/// qui le dit à VoiceOver. Immobile ne se dessine pas — l'absence de glyphe le dit déjà.
enum LocationMotionGlyph {
    static func symbol(for motion: SharedLocationMotion) -> String? {
        switch motion {
        case .stationary: return nil
        case .walking: return "figure.walk"
        case .running: return "figure.run"
        case .cycling: return "bicycle"
        case .automotive: return "car.fill"
        }
    }

    static func label(for motion: SharedLocationMotion) -> String {
        switch motion {
        case .stationary:
            return String(localized: "locationMap.motion.stationary", defaultValue: "Immobile", bundle: .main)
        case .walking:
            return String(localized: "locationMap.motion.walking", defaultValue: "À pied", bundle: .main)
        case .running:
            return String(localized: "locationMap.motion.running", defaultValue: "En courant", bundle: .main)
        case .cycling:
            return String(localized: "locationMap.motion.cycling", defaultValue: "À vélo", bundle: .main)
        case .automotive:
            return String(localized: "locationMap.motion.automotive", defaultValue: "En voiture", bundle: .main)
        }
    }

    /// Le mouvement qui se DESSINE : frais, et pas immobile.
    static func drawn(_ motion: SharedLocationMotion?) -> SharedLocationMotion? {
        guard let motion, symbol(for: motion) != nil else { return nil }
        return motion
    }
}

/// Le glyphe du mouvement posé au bord de l'avatar d'une épingle. Le libellé de l'épingle le dit déjà : il est muet.
struct LocationMotionBadge: View {
    let motion: SharedLocationMotion

    var body: some View {
        if let symbol = LocationMotionGlyph.symbol(for: motion) {
            Image(systemName: symbol)
                .font(MeeshyFont.relative(9, weight: .bold))
                .foregroundStyle(Color.white)
                .frame(width: 18, height: 18)
                .background(Circle().fill(MeeshyColors.indigo700))
                .overlay(Circle().strokeBorder(Color.white, lineWidth: 1.5))
                .accessibilityHidden(true)
        }
    }
}
