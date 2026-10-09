import SwiftUI
import AppIntents

/// Les couleurs et l'avatar communs aux Live Activities de l'îlot (#9782,
/// #9783, #9784). L'extension n'importe pas MeeshyUI : la marque est
/// recopiée ici depuis `MeeshyColors`, comme pour les widgets.
enum LiveActivityStyle {
    static let brand = color(hex: "6366F1")
    static let success = color(hex: "34D399")
    static let warning = color(hex: "FBBF24")
    static let error = color(hex: "F87171")
    static let recording = color(hex: "F87171")

    static func color(hex: String) -> Color {
        let digits = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
        var rgb: UInt64 = 0
        guard digits.count == 6, Scanner(string: digits).scanHexInt64(&rgb) else { return brand }
        return Color(
            red: Double((rgb >> 16) & 0xFF) / 255,
            green: Double((rgb >> 8) & 0xFF) / 255,
            blue: Double(rgb & 0xFF) / 255
        )
    }
}

/// L'avatar d'une activité : les initiales sur la couleur de la personne, ou
/// un glyphe quand le nom n'en donne pas.
struct LiveActivityAvatar: View {
    let initials: String
    let accentHex: String
    let fallbackSymbol: String
    let size: CGFloat

    var body: some View {
        ZStack {
            Circle().fill(LiveActivityStyle.color(hex: accentHex).gradient)
            if initials.isEmpty {
                Image(systemName: fallbackSymbol)
                    .font(.system(size: size * 0.42, weight: .semibold))
            } else {
                Text(initials)
                    .font(.system(size: size * 0.4, weight: .bold, design: .rounded))
                    .minimumScaleFactor(0.5)
            }
        }
        .foregroundStyle(.white)
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}

/// Un bouton rond d'activité : glyphe seul à l'écran, libellé pour VoiceOver.
struct LiveActivityRoundButton<Intent: AppIntent>: View {
    let intent: Intent
    let symbol: String
    let label: String
    let tint: Color
    let size: CGFloat

    var body: some View {
        Button(intent: intent) {
            Image(systemName: symbol)
                .font(.system(size: size * 0.42, weight: .semibold))
                .foregroundStyle(.white)
                .frame(width: size, height: size)
                .background(Circle().fill(tint))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}
