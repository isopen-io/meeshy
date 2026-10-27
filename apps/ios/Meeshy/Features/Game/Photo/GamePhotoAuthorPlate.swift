import Foundation
import MeeshySDK

/// LA PLAQUE D'AUTEUR (#10816) — constat porteur : « le cadre du premier achievement ne dit rien sur
/// l'auteur ». Le cadre d'un succès, d'un rang ou d'une fin de mission grave le PSEUDO de son auteur dans
/// un cartouche : la formule de la famille (« Succès de », « Rang atteint par », « Mission menée par ») et
/// `@pseudo`, à côté d'un médaillon (photo de profil ou monogramme). Miroir de
/// `apps/web/src/lib/game-photo/author-plate.ts` — la MÊME table.
///
/// Tout est une DONNÉE tirée de l'étape, jamais un dessin par cas :
///  - un succès prend le métal de SA rareté VISIBLE et s'estampe à partir d'épique ; sans rareté servie,
///    la plaque neutre (indigo gravé) ;
///  - un rang estampe dans le métal de son blason (`GloryRank.material`) ;
///  - une mission accomplie se gratte, comme un ticket (obsidienne).
///
/// Le PSEUDO, jamais le nom d'affichage (qui peut être un vrai nom) ; un invité, sans pseudo public, n'a
/// pas de plaque.
nonisolated enum PlateFamily: String, Sendable, Equatable {
    case achievement
    case rank
    case mission
}

nonisolated enum PlateFinish: String, Sendable, Equatable, CaseIterable {
    case engrave
    case emboss
    case scratch
}

/// Le métal d'une plaque : les matières du jeu, plus l'indigo de la plaque neutre (un succès dont la rareté
/// n'est pas servie), qui n'est la matière d'aucun objet.
nonisolated enum PlateMetal: String, Sendable, Equatable, CaseIterable {
    case copper
    case bronze
    case silver
    case gold
    case platinum
    case obsidian
    case prism
    case indigo
}

nonisolated struct PlateStyle: Equatable, Sendable {
    let family: PlateFamily
    let finish: PlateFinish
    let metal: PlateMetal
}

/// L'auteur d'une photo : son pseudo public et, s'il en a une, sa photo de profil.
nonisolated struct PhotoAuthor: Equatable, Sendable {
    let handle: String
    let avatar: String?
}

nonisolated struct AuthorPlate: Equatable, Sendable {
    let style: PlateStyle
    /// « Succès de » : la formule, au-dessus du pseudo.
    let caption: String
    /// « @atabeth », coupé et normalisé.
    let name: String
    let monogram: String
    /// La phrase que lit VoiceOver : « Succès de @atabeth ».
    let label: String
    let avatar: String?

    var family: PlateFamily { style.family }
    var finish: PlateFinish { style.finish }
    var metal: PlateMetal { style.metal }
}

nonisolated enum GamePhotoAuthorPlate {

    /// Au-delà, le pseudo se coupe : la plaque garde une taille de lettre lisible plutôt que de rétrécir.
    static let maxHandleGraphemes = 16

    static func style(of emblem: PhotoEmblem) -> PlateStyle? {
        switch emblem {
        case .achievement(let rarity):
            let (finish, metal) = rarity.map(rarityPlate) ?? (.engrave, .indigo)
            return PlateStyle(family: .achievement, finish: finish, metal: metal)
        case .rank(let rank, _):
            return PlateStyle(family: .rank, finish: .emboss, metal: metal(of: rank))
        case .mission:
            return PlateStyle(family: .mission, finish: .scratch, metal: .obsidian)
        case .start, .tier, .levelHundred, .meesh, .treasury, .flame, .trophy, .leagueUp, .season, .prestige:
            return nil
        }
    }

    private static func rarityPlate(_ rarity: GameGlory.AchievementRarity) -> (PlateFinish, PlateMetal) {
        switch rarity {
        case .common: (.engrave, .bronze)
        case .rare: (.engrave, .silver)
        case .epic: (.emboss, .platinum)
        case .legendary: (.emboss, .gold)
        case .mythic: (.emboss, .prism)
        }
    }

    /// La matière de l'écu du rang (la table de `GloryRank.material`, `MeeshyUI`) : cuivre, bronze, argent,
    /// or, platine, obsidienne, prisme.
    static func metal(of rank: GloryRank) -> PlateMetal {
        switch rank {
        case .murmure, .echo: .copper
        case .voix, .conteur: .bronze
        case .passeur, .polyglotte: .silver
        case .ambassadeur, .orateur: .gold
        case .oracle: .platinum
        case .legende: .obsidian
        case .mythe: .prism
        }
    }

    private static func bareHandle(_ handle: String) -> String {
        let trimmed = handle.trimmingCharacters(in: .whitespacesAndNewlines).precomposedStringWithCanonicalMapping
        return String(trimmed.drop { $0 == "@" })
    }

    /// `@pseudo`, normalisé NFC, coupé à 16 graphèmes dont « … ».
    static func engravedHandle(_ handle: String) -> String {
        let bare = bareHandle(handle)
        let kept = bare.count > maxHandleGraphemes ? "\(bare.prefix(maxHandleGraphemes - 1))…" : bare
        return "@\(kept)"
    }

    /// Les deux premières lettres ou chiffres du pseudo, en capitales.
    static func monogram(_ handle: String) -> String {
        String(bareHandle(handle).filter { $0.isLetter || $0.isNumber }.prefix(2)).uppercased()
    }

    static func plate(for emblem: PhotoEmblem, author: PhotoAuthor?) -> AuthorPlate? {
        guard let style = style(of: emblem), let author, !bareHandle(author.handle).isEmpty else { return nil }
        let name = engravedHandle(author.handle)
        return AuthorPlate(
            style: style,
            caption: caption(style.family),
            name: name,
            monogram: monogram(author.handle),
            label: label(style.family, name: name),
            avatar: author.avatar
        )
    }

    /// L'auteur, depuis le compte : un compte inscrit a un pseudo public ; un invité, non.
    static func author(username: String?, isAnonymous: Bool, avatar: String?) -> PhotoAuthor? {
        guard !isAnonymous, let username, !bareHandle(username).isEmpty else { return nil }
        let picture = avatar?.trimmingCharacters(in: .whitespacesAndNewlines)
        return PhotoAuthor(handle: username, avatar: picture?.isEmpty == false ? picture : nil)
    }

    private static func caption(_ family: PlateFamily) -> String {
        switch family {
        case .achievement: String(localized: "game.photo.author.caption.achievement", defaultValue: "Haut fait de", bundle: .main)
        case .rank: String(localized: "game.photo.author.caption.rank", defaultValue: "Rang atteint par", bundle: .main)
        case .mission: String(localized: "game.photo.author.caption.mission", defaultValue: "Rêve réalisé par", bundle: .main)
        }
    }

    private static func label(_ family: PlateFamily, name: String) -> String {
        switch family {
        case .achievement: String(localized: "game.photo.author.label.achievement", defaultValue: "Haut fait de \(name)", bundle: .main)
        case .rank: String(localized: "game.photo.author.label.rank", defaultValue: "Rang atteint par \(name)", bundle: .main)
        case .mission: String(localized: "game.photo.author.label.mission", defaultValue: "Rêve réalisé par \(name)", bundle: .main)
        }
    }
}

extension PhotoAuthor {
    /// L'auteur d'une photo prise sur cet appareil : le compte connecté.
    @MainActor
    static func current() -> PhotoAuthor? {
        let user = AuthManager.shared.currentUser
        return GamePhotoAuthorPlate.author(username: user?.username, isAnonymous: user?.isAnonymous ?? false, avatar: user?.avatar)
    }
}
