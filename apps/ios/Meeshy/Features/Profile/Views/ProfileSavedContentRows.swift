import SwiftUI
import MeeshySDK
import MeeshyUI

/// « Mes contenus » sur ma fiche (#18590) : ce que j'ai gardé — messages favoris, publications enregistrées, packs.
/// Ces portes ont quitté les Réglages (qui règlent) pour la fiche (qui montre ce qui est à moi). Les raccourcis de packs
/// de la tête se fondent ici ; la Boutique, elle, reste aux Réglages, qui la règlent.
struct ProfileSavedContentRows: View {

    static var doors: [ProfileDoor] { Item.allCases.map(\.door) }

    let accentHex: String
    let onOpen: (ProfileDoor) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            ProfileSectionHeader(icon: "tray.full.fill", title: Self.title, color: MeeshyColors.warning)
            VStack(spacing: 0) {
                ForEach(Item.allCases, id: \.self) { item in
                    ProfileNavigationRow(icon: item.icon, title: item.title, hint: item.hint,
                                         identifier: item.identifier, accentHex: accentHex) { onOpen(item.door) }
                }
            }
            .background(ProfileSectionCard(tintHex: accentHex))
        }
    }

    static var title: String {
        String(localized: "profile.section.saved_content", defaultValue: "MES CONTENUS", bundle: .main)
    }

    /// Les rangées, dans l'ordre de la fiche. Les titres de « Messages favoris » et « Publications enregistrées »
    /// reprennent les clés déjà traduites de l'ancienne section « Outils Meeshy » des Réglages : le même mot, partout.
    private enum Item: CaseIterable {
        case starredMessages, bookmarks, myPacks

        var door: ProfileDoor {
            switch self {
            case .starredMessages: return .starredMessages
            case .bookmarks: return .bookmarks
            case .myPacks: return .myPacks
            }
        }

        var icon: String {
            switch self {
            case .starredMessages: return "star.fill"
            case .bookmarks: return "bookmark.fill"
            case .myPacks: return "shippingbox.fill"
            }
        }

        var title: String {
            switch self {
            case .starredMessages: return String(localized: "settings.tools.starred", defaultValue: "Messages favoris", bundle: .main)
            case .bookmarks: return String(localized: "settings.tools.bookmarks", defaultValue: "Publications enregistrées", bundle: .main)
            case .myPacks: return String(localized: "profile.packs.mine", defaultValue: "Mes packs", bundle: .main)
            }
        }

        var hint: String {
            switch self {
            case .starredMessages:
                return String(localized: "profile.content.starred.hint", defaultValue: "Ouvre les messages que tu as mis en favori", bundle: .main)
            case .bookmarks:
                return String(localized: "profile.content.bookmarks.hint", defaultValue: "Ouvre les publications que tu as enregistrées", bundle: .main)
            case .myPacks:
                return String(localized: "profile.packs.mine.hint", defaultValue: "Ouvre les packs que tu as installés", bundle: .main)
            }
        }

        var identifier: String {
            switch self {
            case .starredMessages: return "profile.content.starred"
            case .bookmarks: return "profile.content.bookmarks"
            case .myPacks: return "profile.packs.mine"
            }
        }
    }
}
