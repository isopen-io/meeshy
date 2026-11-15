import SwiftUI
import MeeshySDK

// MARK: - Les pages de la feuille : onglets fixes, un par pack, la Boutique (#9190)

/// **Ce que la barre d'onglets de la feuille propose** (#9190, suite iOS de
/// #9141).
///
/// La feuille web montre « Favoris · un onglet par pack installé ·
/// Personnalisés · Boutique ». iOS y ajoute ce qu'il avait déjà et que le web
/// n'a pas (Recherche, Récents, Smileys) : ce qui existe et complète la cible
/// s'agrège, ne se supprime pas.
///
/// Les onglets FIXES restent des `StickerSheetTab` — leurs sections, leur
/// atteignabilité et leurs témoins ne changent pas. Un PACK n'est pas un cas
/// d'énumération : c'est une donnée (son slug), parce que l'utilisateur en
/// installe et en retire. `StickerSheetTab.meeAndMeo` n'est plus jamais une
/// page : il ne sert plus que de titre à la section Mee de Favoris et Récents.
public enum StickerSheetPage: Hashable, Identifiable {
    case fixed(StickerSheetTab)
    case pack(String)
    case shop

    public var id: String {
        switch self {
        case .fixed(let tab): "tab.\(tab.rawValue)"
        case .pack(let slug): "pack.\(slug)"
        case .shop: "shop"
        }
    }

    public var isPack: Bool {
        if case .pack = self { return true }
        return false
    }

    /// **Les pages servies, dans l'ordre — la règle PURE.**
    ///
    /// - `hasMee` : l'hôte sait envoyer ou poser un film Mee (`meeStickerPick`).
    ///   Sans lui, aucun pack intégré n'a d'onglet (loi 4).
    /// - `installed` : les packs installés, `nil` tant qu'on ne sait pas — les
    ///   trois intégrés le sont alors par défaut (`installedByDefault` du
    ///   shared), et la feuille ne les cache pas le temps d'un aller-retour.
    /// - `hasPackPick` : l'hôte sait envoyer ou poser un sticker de tiers.
    /// - `hasShop` : l'hôte sert la Boutique.
    ///
    /// Les intégrés gardent LEUR ordre (Mee, Meo, Mee & Meo) ; les packs des
    /// tiers suivent dans l'ordre du serveur, et seulement s'ils portent un
    /// sticker qu'iOS sait poser — un onglet vide serait une porte sur rien.
    public static func offered(hasMee: Bool, installed: [StickerPack]?,
                               hasPackPick: Bool, hasShop: Bool) -> [StickerSheetPage] {
        let installedSlugs = installed.map { Set($0.map(\.slug)) }
        let builtins: [StickerSheetPage] = hasMee
            ? BuiltinStickerPack.allCases
                .filter { installedSlugs?.contains($0.rawValue) ?? true }
                .map { .pack($0.rawValue) }
            : []
        let thirdParty: [StickerSheetPage] = hasPackPick
            ? (installed ?? [])
                .filter { BuiltinStickerPack(slug: $0.slug) == nil && !$0.sendableItems.isEmpty }
                .map { .pack($0.slug) }
            : []
        let lead: [StickerSheetPage] = [.fixed(.search), .fixed(.favorites), .fixed(.recents)]
        let tail: [StickerSheetPage] = [.fixed(.custom), .fixed(.smileys)] + (hasShop ? [.shop] : [])
        return lead + builtins + thirdParty + tail
    }

    /// La page choisie si elle est encore servie, sinon la première — un pack
    /// retiré pendant que son onglet était ouvert ne laisse pas la feuille sur
    /// une page disparue.
    public static func resolved(_ chosen: StickerSheetPage,
                                among offered: [StickerSheetPage]) -> StickerSheetPage {
        offered.contains(chosen) ? chosen : (offered.first ?? .fixed(.search))
    }
}

// MARK: - Les packs que l'hôte sert à la feuille

/// **Ce que l'app injecte pour que la feuille montre ses packs** (#9190).
///
/// La feuille ne charge rien et ne décide de rien : la liste vient du magasin
/// de l'app (cache d'abord), la Boutique est une vue de l'app, et ce que fait
/// un sticker choisi (l'envoyer, le poser) est la destination de l'hôte.
/// Sans injection, aucun pack de tiers ni Boutique (loi 4) ; les packs
/// intégrés restent, installés par défaut.
public struct StickerPackShelf {
    public let installed: [StickerPack]?
    public let onPick: (StickerPack, StickerPackItem) -> Void
    public let shop: (() -> AnyView)?

    public init(installed: [StickerPack]?,
                onPick: @escaping (StickerPack, StickerPackItem) -> Void,
                shop: (() -> AnyView)? = nil) {
        self.installed = installed
        self.onPick = onPick
        self.shop = shop
    }
}

public struct StickerPackShelfKey: EnvironmentKey {
    public static let defaultValue: StickerPackShelf? = nil
}

extension EnvironmentValues {
    public var stickerPackShelf: StickerPackShelf? {
        get { self[StickerPackShelfKey.self] }
        set { self[StickerPackShelfKey.self] = newValue }
    }
}

extension View {
    public func stickerPackShelfProvided(_ shelf: StickerPackShelf) -> some View {
        environment(\.stickerPackShelf, shelf)
    }
}
