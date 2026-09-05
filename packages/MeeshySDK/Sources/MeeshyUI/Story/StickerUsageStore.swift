import Foundation
import Combine
import MeeshySDK

// MARK: - Ce que l'auteur a POSÉ, et ce qu'il a ÉPINGLÉ

/// **L'identité d'une décoration, indépendamment de ce qui la dessine.**
///
/// Les onglets FAVORIS et RÉCENTS (directive porteur 2026-09-05) doivent
/// retenir des décorations de DEUX natures — un glyphe du système et un gabarit
/// du catalogue — dont rien, jusqu'ici, ne partageait la forme : l'un est une
/// `String`, l'autre un `StickerTemplate` avec sa famille et ses emplacements.
///
/// Ce type est le plus petit dénominateur qui les DÉSIGNE sans les porter.
/// Retenir le gabarit entier aurait persisté un dessin — donc figé, dans les
/// préférences de l'auteur, une version du catalogue que la mise à jour
/// suivante contredirait. On retient un identifiant ; le catalogue reste la
/// source du dessin.
///
/// > Un favori n'est pas une copie de ce qu'on aime : c'est un renvoi vers lui.
/// `nonisolated` : le module compile sous isolation `MainActor` par défaut, et
/// ce type est une VALEUR — un identifiant composé, sans état ni horloge. Le
/// laisser isolé le rendait inconstructible depuis une règle pure de l'app
/// (`MessageStickerFavorite`, qui traduit un `MessageSticker` en entrée de
/// palette hors de tout acteur).
public nonisolated struct StickerUsageEntry: Codable, Hashable, Identifiable, Sendable {

    public enum Kind: String, Codable, Sendable {
        /// Un glyphe du système — `value` EST l'emoji.
        case emoji
        /// Un gabarit du catalogue — `value` est son `StickerTemplate.id`.
        case template
        /// **Une image de « Mes stickers »** — `value` est son
        /// `StoryStickerLibraryItem.id` (2026-09-05).
        ///
        /// Elle est une TROISIÈME nature et non un `template` déguisé : son
        /// dessin n'est pas au catalogue, il est sur le disque de l'auteur.
        /// Une entrée dont la cible a été effacée de la bibliothèque est donc
        /// ignorée à l'affichage, exactement comme un gabarit retiré d'une
        /// version à l'autre — la même règle, deux magasins.
        case library
    }

    public let kind: Kind
    public let value: String

    /// L'identité composée, stable, et lisible dans un `UserDefaults` inspecté
    /// à la main — ce qui compte le jour où l'on diagnostique un favori qui ne
    /// revient pas.
    public var id: String { "\(kind.rawValue):\(value)" }

    public init(kind: Kind, value: String) {
        self.kind = kind
        self.value = value
    }

    public static func emoji(_ glyphe: String) -> StickerUsageEntry {
        StickerUsageEntry(kind: .emoji, value: glyphe)
    }

    public static func template(_ gabarit: StickerTemplate) -> StickerUsageEntry {
        StickerUsageEntry(kind: .template, value: gabarit.id)
    }

    public static func library(_ item: StoryStickerLibraryItem) -> StickerUsageEntry {
        StickerUsageEntry(kind: .library, value: item.id)
    }
}

/// **Le magasin des FAVORIS et des RÉCENTS.**
///
/// Un store de préférences, donc SDK (§ « Tableau de placement » du
/// `CLAUDE.md` du SDK, ligne « Stores de préférences ») : il ne décide de rien
/// et n'orchestre personne — il retient, il rend, il borne.
///
/// ## Trois décisions, et aucune n'est un défaut de `UserDefaults`
///
/// **1. Les récents sont BORNÉS, les favoris ne le sont pas.** Une liste de
/// récents non bornée cesse d'être un raccourci : au bout de deux cents
/// entrées, retrouver quelque chose y coûte autant que dans le catalogue. Les
/// favoris, eux, sont posés à la main — leur nombre est déjà borné par la
/// patience de l'auteur, et en refuser un serait refuser une intention
/// explicite.
///
/// **2. Poser une décoration déjà récente la REMONTE, elle ne la duplique
/// pas.** Sans quoi la liste se remplirait du même sticker et perdrait
/// exactement ce qu'elle sert à donner : la variété de ce qu'on a fait.
///
/// **3. L'écriture est SYNCHRONE et immédiate.** Un `UserDefaults` débattu en
/// arrière-plan perdrait la dernière pose si l'app est tuée juste après — et
/// c'est précisément la pose qu'on veut retrouver à la réouverture.
@MainActor
public final class StickerUsageStore: ObservableObject {

    /// **Le nombre de récents retenus — CINQUANTE** (directive porteur
    /// 2026-09-05 : « il faut mettre dans la liste des stickers récents les 50
    /// derniers stickers utilisés »).
    ///
    /// C'était vingt-cinq, choisis pour remplir exactement cinq rangées de
    /// cinq. L'argument était de mise en page ; la directive tranche sur
    /// l'USAGE, et elle a raison sur le fond : une liste de récents sert à
    /// RETROUVER, et vingt-cinq poses couvrent quelques minutes de composition
    /// sur une palette de deux cents décorations. Cinquante reste un multiple
    /// de cinq — deux écrans de défilement, pas une archive.
    ///
    /// > La borne existe toujours, et pour la même raison : au-delà, retrouver
    /// > quelque chose dans les récents coûte autant que dans le catalogue.
    /// > Ce qui change est OÙ se trouve ce seuil, et c'est l'usage qui le dit,
    /// > pas la grille.
    public static let recentsLimit = 50

    // **iOS 26.1 — `deinit` synthétisée ISOLÉE** (SE-0466, isolation MainActor
    // par défaut) → double-free `pointer being freed was not allocated` au
    // démontage hors d'une tâche. Mesuré ici le 2026-09-05 : la suite est
    // partie en crash à son huitième cas, et xctest a redémarré en rendant
    // « Executed 0 tests » — le mode d'extinction le plus trompeur, puisque le
    // compte remis à zéro RESSEMBLE à une suite qui n'existe pas.
    //
    // Même patron que `MentionComposerController.deinit` et
    // `ComposerMentionControllerBox.deinit`. Garde : `MainActorDeinitSourceGuardTests`.
    nonisolated deinit {}

    @Published public private(set) var recents: [StickerUsageEntry] = []
    @Published public private(set) var favorites: [StickerUsageEntry] = []

    private let defaults: UserDefaults
    private let recentsKey = "meeshy.sticker.recents"
    private let favoritesKey = "meeshy.sticker.favorites"

    public static let shared = StickerUsageStore()

    /// - Parameter defaults: injecté pour que les témoins s'exécutent sur un
    ///   domaine JETABLE. Un store qui lirait `.standard` en dur écrirait dans
    ///   les préférences de l'app HÔTE pendant les tests — le piège que la
    ///   grappe des tests nomme « cascade de drapeaux et domaine de l'app
    ///   hôte », et qui rend deux suites dépendantes de leur ordre.
    public init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        recents = decode(recentsKey)
        favorites = decode(favoritesKey)
    }

    // MARK: - Lecture

    public func isFavorite(_ entree: StickerUsageEntry) -> Bool {
        favorites.contains(entree)
    }

    // MARK: - Écriture

    /// L'auteur vient de POSER cette décoration : elle passe en tête des
    /// récents, sans doublon, et la queue est coupée à la limite.
    public func noteUse(_ entree: StickerUsageEntry) {
        var suivants = recents.filter { $0 != entree }
        suivants.insert(entree, at: 0)
        if suivants.count > Self.recentsLimit {
            suivants.removeLast(suivants.count - Self.recentsLimit)
        }
        recents = suivants
        encode(suivants, forKey: recentsKey)
    }

    /// Épingle ou dépingle. Le nouvel épinglé passe en TÊTE : c'est le geste
    /// qu'on vient de faire, et le chercher en bas d'une liste qu'on vient
    /// d'allonger serait le contraire d'un raccourci.
    public func toggleFavorite(_ entree: StickerUsageEntry) {
        if favorites.contains(entree) {
            favorites.removeAll { $0 == entree }
        } else {
            favorites.insert(entree, at: 0)
        }
        encode(favorites, forKey: favoritesKey)
    }

    // MARK: - Persistance

    /// Une lecture qui échoue rend `[]`, jamais une exception : des préférences
    /// corrompues doivent coûter des favoris perdus, jamais un écran qui ne
    /// s'ouvre pas.
    private func decode(_ key: String) -> [StickerUsageEntry] {
        guard let data = defaults.data(forKey: key),
              let liste = try? JSONDecoder().decode([StickerUsageEntry].self, from: data)
        else { return [] }
        return liste
    }

    private func encode(_ liste: [StickerUsageEntry], forKey key: String) {
        guard let data = try? JSONEncoder().encode(liste) else { return }
        defaults.set(data, forKey: key)
    }
}
