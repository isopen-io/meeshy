import SwiftUI
import MeeshySDK
import MeeshyUI

/// « Mes contenus » sur ma fiche (#18590, planche `Moi-Actions`) : ce que j'ai gardé — messages favoris, publications
/// enregistrées, packs. Ces portes ont quitté les Réglages (qui règlent) pour la fiche (qui montre ce qui est à moi).
/// Faites du kit (#19469) : l'en-tête de section K44 et une rangée K06 par contenu, son nombre en valeur dès que la
/// passerelle le sert (#19470) ; sans lui, la rangée garde son chevron, jamais un zéro inventé.
struct ProfileSavedContentRows: View {

    static var doors: [ProfileDoor] { Item.allCases.map(\.door) }

    let stats: UserStats?
    let accentColor: String
    let onOpen: (ProfileDoor) -> Void

    @Environment(\.locale) private var locale

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            MeeshySectionHeader(title: Self.title)
            VStack(spacing: 0) {
                ForEach(Item.allCases, id: \.self) { item in
                    row(item)
                }
            }
            .meeshyGlass(in: RoundedRectangle(cornerRadius: MeeshyRadius.lg), tone: .theme)
        }
    }

    private func row(_ item: Item) -> some View {
        let count = Self.count(of: item.door, in: stats)
        let accessory: MeeshyToggleRowAccessory = count.map { .value(Self.formatted($0, locale: locale)) } ?? .chevron
        return MeeshyToggleRow(item.title, systemImage: item.icon, accessory: accessory,
                               showsDivider: item != Item.allCases.last, tint: Color(hex: accentColor),
                               action: { onOpen(item.door) })
            .accessibilityIdentifier(item.identifier)
    }

    static var title: String {
        String(localized: "profile.section.saved_content", defaultValue: "MES CONTENUS", bundle: .main)
    }

    /// Le nombre servi pour cette porte ; `nil` tant que la passerelle ne le sert pas.
    static func count(of door: ProfileDoor, in stats: UserStats?) -> Int? {
        switch door {
        case .starredMessages: return stats?.starredMessagesCount
        case .bookmarks: return stats?.bookmarksCount
        case .myPacks: return stats?.packsCount
        default: return nil
        }
    }

    static func formatted(_ count: Int, locale: Locale) -> String {
        count.formatted(IntegerFormatStyle<Int>.number.locale(locale))
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

        var identifier: String {
            switch self {
            case .starredMessages: return "profile.content.starred"
            case .bookmarks: return "profile.content.bookmarks"
            case .myPacks: return "profile.packs.mine"
            }
        }
    }
}
