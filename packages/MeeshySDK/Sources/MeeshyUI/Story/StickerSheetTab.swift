import SwiftUI
import MeeshySDK

// MARK: - Les cinq onglets de la feuille (directive porteur 2026-09-05)

/// **Ce que la feuille de stickers propose, en cinq entrées** (directive
/// porteur 2026-09-05).
///
/// > « Une tab de recherche, favoris, récents, dynamique (pour les stickers
/// > avec localisation, texte, météo), smileys. Dans chaque tab tout est
/// > organisé par section. »
///
/// ## Ce que ce type remplace, et pourquoi le remplacement est une CORRECTION
///
/// La feuille portait un interrupteur à DEUX positions — `StickerPaletteNature`
/// : *sticker* / *smiley* (#5012), supprimé avec ce lot faute de consommateur.
/// Il répondait à « qu'est-ce que c'est ? », et c'était la bonne question tant
/// que la seule alternative était un ruban de
/// vingt-deux familles. Elle a cessé de l'être : sous *sticker*, l'auteur
/// recevait **dix-huit sections** dans un seul défilement, sans moyen de
/// retrouver ce qu'il venait d'employer, ni d'atteindre les quatre familles qui
/// exigent une donnée VIVANTE (un lieu, une heure, la météo, ses propres mots)
/// autrement qu'en traversant les quatorze autres.
///
/// > Une liste verticale montre l'inventaire — c'était l'acquis de #5012, et il
/// > reste vrai. Ce qu'elle ne montre pas, c'est le CHEMIN : dix-huit sections
/// > toutes également lointaines, où la deuxième visite coûte autant que la
/// > première.
///
/// Les cinq onglets répondent à « qu'est-ce que je cherche ? », question qui
/// précède celle de la nature. Et ils ne suppriment pas les sections : chacun
/// en contient, ce qui préserve l'inventaire là où il a du sens.
///
/// ## L'ordre, et ce qu'il coûte de le changer
///
/// RECHERCHE d'abord parce que c'est le seul onglet qui atteint TOUT ;
/// FAVORIS et RÉCENTS ensuite parce qu'ils sont les plus courts chemins pour
/// qui revient ; DYNAMIQUE puis SMILEYS ferment, parce qu'ils sont les deux
/// seuls qu'on ouvre en SACHANT ce qu'on veut.
public enum StickerSheetTab: String, CaseIterable, Identifiable, Sendable {

    /// Le catalogue ENTIER, filtrable — le seul onglet qui atteint tout.
    case search
    /// Ce que l'auteur a épinglé.
    case favorites
    /// Ce qu'il a posé récemment.
    case recents
    /// Les décorations qui portent une donnée VIVANTE : ses mots, un lieu
    /// alentour, l'heure, la météo. Elles sont ensemble parce qu'elles
    /// partagent une propriété que les quatorze autres familles n'ont pas —
    /// leur contenu n'existe pas avant l'ouverture de la feuille.
    case dynamic
    /// Les glyphes du système, par catégorie Unicode.
    case smileys

    public var id: String { rawValue }

    public var symbolName: String {
        switch self {
        case .search:    return "magnifyingglass"
        case .favorites: return "star.fill"
        case .recents:   return "clock.arrow.circlepath"
        case .dynamic:   return "bolt.fill"
        case .smileys:   return "face.smiling"
        }
    }

    public var title: String {
        switch self {
        case .search:
            return String(localized: "sticker.sheet.tab.search", defaultValue: "Recherche", bundle: .module)
        case .favorites:
            return String(localized: "sticker.sheet.tab.favorites", defaultValue: "Favoris", bundle: .module)
        case .recents:
            return String(localized: "sticker.sheet.tab.recents", defaultValue: "Récents", bundle: .module)
        case .dynamic:
            return String(localized: "sticker.sheet.tab.dynamic", defaultValue: "Dynamique", bundle: .module)
        case .smileys:
            return String(localized: "sticker.sheet.tab.smileys", defaultValue: "Smileys", bundle: .module)
        }
    }

    /// **Les familles qui portent une donnée VIVANTE.**
    ///
    /// C'est la définition de l'onglet DYNAMIQUE, écrite une fois : le contenu
    /// de ces quatre-là n'existe pas avant l'ouverture — il vient de l'horloge,
    /// du GPS, du service météo, ou du clavier. Les quatorze autres sont des
    /// catalogues figés, connus à la compilation.
    ///
    /// La liste est ORDONNÉE : TEXTE d'abord parce qu'il ne dépend d'aucune
    /// autorisation et qu'il répond toujours ; LIEU ensuite, qui en demande
    /// une ; puis l'heure et la météo, que l'auteur ne vient presque jamais
    /// chercher en premier.
    public static let dynamicTabs: [StickerPaletteTab] = [.text, .place, .time, .weather]

    /// **Les sections d'un onglet, dans l'ordre — la règle PURE.**
    ///
    /// - Parameter offered: les onglets de palette réellement servis
    ///   (`StickerPaletteTab.offered`), qui portent déjà la loi 4 : un magasin
    ///   non injecté ne laisse aucune section derrière lui.
    ///
    /// `favorites` et `recents` rendent `[]`, et ce n'est PAS un oubli : leur
    /// contenu ne se range pas par famille de catalogue mais par ce que
    /// l'auteur a fait. Leurs sections viennent du magasin d'usage, pas d'ici —
    /// et ce `[]` est ce qui empêche un futur lot de leur greffer le catalogue
    /// « en attendant ».
    public static func sections(of tab: StickerSheetTab,
                                offered: [StickerPaletteTab]) -> [StickerPaletteTab] {
        switch tab {
        case .smileys:
            return offered.filter { $0 == .emoji }
        case .dynamic:
            return dynamicTabs.filter(offered.contains)
        case .search:
            // Tout ce qui n'est ni un smiley ni une donnée vivante — c'est-à-dire
            // les catalogues figés, plus « Mes stickers ». L'onglet RECHERCHE
            // est le seul qui les atteint, donc il les prend tous : une famille
            // qui n'appartiendrait à aucun onglet serait invisible, et rien ne
            // le dirait.
            return offered.filter { $0 != .emoji && !dynamicTabs.contains($0) }
        case .favorites, .recents:
            return []
        }
    }

    /// **Toute famille servie appartient à AU MOINS un onglet.**
    ///
    /// Le témoin de complétude, écrit comme une règle pour qu'il s'éprouve sans
    /// monter d'écran : c'est la garantie qu'aucune des vingt-deux familles ne
    /// devient inatteignable en passant du ruban aux onglets. Une famille
    /// oubliée ne casse rien — elle DISPARAÎT, et une disparition n'a pas de
    /// site où rougir.
    public static func unreachable(among offered: [StickerPaletteTab]) -> [StickerPaletteTab] {
        let atteintes = Set(allCases.flatMap { sections(of: $0, offered: offered) })
        return offered.filter { !atteintes.contains($0) }
    }
}
