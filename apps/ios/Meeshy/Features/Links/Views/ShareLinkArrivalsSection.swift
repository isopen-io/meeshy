import SwiftUI
import MeeshySDK
import MeeshyUI

/// Un arrivant (planche `Lien-Partage`, #18871) : la rangée de personne du kit (K39) — avatar, nom, la pastille
/// « Compte Meeshy » ou « Invité », le pays et la langue dessous, l'ancienneté à la fin. La MÊME rangée sert les
/// arrivées de la fiche et la liste complète (#7813) ; le lecteur d'écran la lit d'un seul tenant.
struct ShareLinkArrivalRow: View, Equatable {
    let entry: ShareLinkArrivalEntry
    var avatarURL: String? = nil
    let isDark: Bool

    var body: some View {
        MeeshyPersonRow(
            title: entry.displayName,
            subtitle: subtitle,
            meta: entry.joinedAt.formatted(.relative(presentation: .named, unitsStyle: .abbreviated)),
            levelImage: entry.isAnonymous ? "person" : "checkmark.seal.fill",
            levelLabel: kindLabel,
            showsDivider: false,
            label: accessibilityText
        ) {
            MeeshyAvatar(name: entry.displayName, context: .custom(36), avatarURL: avatarURL, enablePulse: false,
                         isDark: isDark)
        }
    }

    private var kindLabel: String {
        entry.isAnonymous ? ShareLinkDetailCopy.guest : ShareLinkDetailCopy.meeshyAccount
    }

    /// Le pays (drapeau et code) puis la langue : « 🇵🇹 PT · Português ».
    private var subtitle: String? {
        let country = entry.country.map { code -> String in
            let flag = CountryFlag.emoji(for: code)
            return flag.isEmpty ? code : "\(flag) \(code)"
        }
        let parts = [country, languageName].compactMap { $0 }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    private var languageName: String? {
        guard let language = entry.language, !language.isEmpty else { return nil }
        return LanguageData.autonym(for: language)
    }

    /// Nom, nature du compte, pays, langue, ancienneté — en une phrase.
    var accessibilityText: String {
        [
            entry.displayName,
            kindLabel,
            entry.country.flatMap(CountryFlag.name(for:)),
            languageName,
            entry.joinedAt.formatted(.relative(presentation: .named)),
        ]
        .compactMap { $0 }
        .filter { !$0.isEmpty }
        .joined(separator: ", ")
    }
}
