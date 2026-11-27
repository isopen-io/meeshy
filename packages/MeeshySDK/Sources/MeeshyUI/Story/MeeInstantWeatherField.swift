import SwiftUI
import MeeshySDK

/// **Le champ Météo des Instants, sous le titre de sa famille** (#9113) — le
/// quatrième champ du web (`composer-mee-stickers.tsx`, `FIELDS`). L'auteur
/// écrit le temps qu'il fait, les vignettes météo le redessinent à la frappe,
/// et il part dans `slots.weather`. Vide, chaque sticker garde le sien
/// (« Grand soleil », « Il pleut »…).
struct MeeInstantWeatherField: View {
    @Binding var text: String

    var body: some View {
        TextField(String(localized: "sticker.sheet.instants.weather.placeholder",
                         defaultValue: "Le temps qu’il fait…", bundle: .module),
                  text: $text)
            .font(MeeshyFont.relative(15, weight: .medium, design: .rounded))
            .textFieldStyle(.plain)
            .submitLabel(.done)
            .padding(.horizontal, 14)
            .frame(minHeight: 44)
            .background(Capsule().fill(Color.primary.opacity(0.06)))
            .overlay(Capsule().stroke(Color.primary.opacity(0.10), lineWidth: 1))
            .accessibilityLabel(String(localized: "sticker.sheet.instants.weather.a11y",
                                       defaultValue: "Météo écrite sur les stickers", bundle: .module))
            .accessibilityIdentifier(StickerAccessibilityID.instantWeatherField)
    }
}
