import Foundation
import UIKit

// MARK: - La palette D'AFFICHAGE d'une conversation (#10631, spec §§ 5.4, 8.3)
//
// `colorPalette` reste la palette CALCULÉE (langue × type × thème), encodée comme
// avant : le cache GRDB et les anciens clients la lisent à l'identique. L'accent
// PERSONNEL du lecteur (`userState.appearance.accent`) ne s'y écrit jamais ; il
// se résout ici, à la lecture, donc un changement d'accent met la ligne de liste
// et le fil à jour sans relecture réseau.

public extension AppearanceScheme {
    /// Le schéma courant de l'application : le choix explicite de l'utilisateur
    /// (`themePreference`), sinon celui du système.
    static var current: AppearanceScheme {
        switch UserDefaults.standard.string(forKey: "themePreference") {
        case "dark": return .dark
        case "light": return .light
        default: return UITraitCollection.current.userInterfaceStyle == .dark ? .dark : .light
        }
    }
}

public extension MeeshyConversation {
    /// La palette que l'utilisateur VOIT : l'accent de la gamme choisi (sa teinte du
    /// schéma) décliné à ±30°, sinon la palette calculée, inchangée.
    func displayPalette(scheme: AppearanceScheme) -> ConversationColorPalette {
        guard let key = userState.appearance?.accent,
              let hex = AppearanceCatalog.shared.gamut.accent(key, scheme: scheme) else { return colorPalette }
        return ConversationColorPalette.derived(fromPrimary: hex, saturationBoost: colorPalette.saturationBoost)
    }

    func displayPalette(isDark: Bool) -> ConversationColorPalette { displayPalette(scheme: isDark ? .dark : .light) }

    var displayPalette: ConversationColorPalette { displayPalette(scheme: .current) }
}
