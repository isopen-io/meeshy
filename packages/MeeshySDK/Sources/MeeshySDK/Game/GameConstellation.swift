import Foundation

// MARK: - La constellation (#10053, décision du porteur du 2026-10-11)
//
// MIROIR de `packages/shared/utils/game/constellation.ts`, rejoué sur les vecteurs partagés (`constellation`,
// `constellation-key`). Tous les DIX fragments d'étoile collectés (`StarFragmentsTotal`), une étoile s'allume ; chacune
// débloque UN cosmétique de profil — halo, cadre, scintillement — sans avantage de jeu. Le total est DÉRIVÉ, jamais
// dépensé ; rien ne s'y convertit. La clé d'un cosmétique est déterministe : `constellation.star-<n>.<genre>`.
// Un visiteur ne reçoit que des étoiles, figées au mois, selon le réglage de la vitrine (`UserShowcaseResponse`).

public enum ConstellationCosmeticKind: String, Codable, Sendable, CaseIterable {
    case halo, frame, sparkle
}

public struct ConstellationCosmetic: Sendable, Equatable, Hashable {
    public let star: Int
    public let kind: ConstellationCosmeticKind
    public let cosmeticKey: String
}

public struct Constellation: Sendable, Equatable {
    public let collected: Int
    public let stars: Int
    public let inStar: Int
    public let toNextStar: Int
    public let cosmetics: [ConstellationCosmetic]
}

public enum GameConstellation {
    public static let fragmentsPerStar = 10
    public static let kinds: [ConstellationCosmeticKind] = [.halo, .frame, .sparkle]

    /// Le cosmétique que débloque l'étoile n (n ≥ 1) ; `nil` sinon.
    public static func starCosmetic(_ star: Int) -> ConstellationCosmetic? {
        guard star >= 1 else { return nil }
        let kind = kinds[(star - 1) % kinds.count]
        return ConstellationCosmetic(star: star, kind: kind, cosmeticKey: "constellation.star-\(star).\(kind.rawValue)")
    }

    /// `true` pour une clé que la constellation produit — l'étoile ET son genre concordent.
    public static func isCosmeticKey(_ key: String) -> Bool {
        let prefix = "constellation.star-"
        guard key.hasPrefix(prefix) else { return false }
        let rest = key.dropFirst(prefix.count)
        guard let dot = rest.firstIndex(of: ".") else { return false }
        let digits = rest[rest.startIndex..<dot]
        guard (1...6).contains(digits.count), digits.first != "0", digits.allSatisfy({ $0.isASCII && $0.isNumber }),
              let star = Int(digits) else { return false }
        return starCosmetic(star)?.cosmeticKey == key
    }

    /// La constellation d'un total collecté.
    public static func of(collected rawCollected: Int) -> Constellation {
        let collected = max(0, rawCollected)
        let stars = collected / fragmentsPerStar
        let inStar = collected % fragmentsPerStar
        return Constellation(collected: collected, stars: stars, inStar: inStar, toNextStar: fragmentsPerStar - inStar,
                             cosmetics: stars < 1 ? [] : (1...stars).compactMap(starCosmetic))
    }

    /// Les cosmétiques d'un visiteur, qui ne reçoit que des étoiles.
    public static func of(stars: Int) -> Constellation {
        of(collected: max(0, stars) * fragmentsPerStar)
    }
}
