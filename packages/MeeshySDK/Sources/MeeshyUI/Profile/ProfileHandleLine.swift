import Foundation

/// **La ligne sous le nom d'un profil (#19987)** : « @pseudo · depuis novembre 2026 », la même sur ma vitrine et sur la
/// fiche d'un autre. Elle remplace la ligne « Sur Meeshy depuis… » plus bas et le badge « Membre depuis » : le pseudo et
/// l'ancienneté se lisent d'un regard. Dans la barre repliée, le seul @pseudo — la barre n'est que sa rangée.
@MainActor
public enum ProfileHandleLine {

    /// Sans date servie, le pseudo seul : la ligne n'invente aucun mois.
    @MainActor public static func text(username: String, memberSince: Date?, locale: Locale, inBar: Bool = false) -> String {
        let handle = "@\(username)"
        guard !inBar, let memberSince else { return handle }
        return String(format: format, handle, monthAndYear(of: memberSince, locale: locale))
    }

    /// La phrase, dans la langue de l'interface ; le mois, dans la locale demandée.
    /// `@MainActor` malgré le type `nonisolated` : `Bundle.module`.
    @MainActor static var format: String {
        String(localized: "profile.handle.since", defaultValue: "%1$@ · depuis %2$@", bundle: .module)
    }

    private static func monthAndYear(of date: Date, locale: Locale) -> String {
        let formatter = DateFormatter()
        formatter.locale = locale
        formatter.setLocalizedDateFormatFromTemplate("MMMMy")
        return formatter.string(from: date)
    }
}
