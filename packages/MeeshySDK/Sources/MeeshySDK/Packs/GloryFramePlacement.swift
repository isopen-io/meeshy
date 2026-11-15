import Foundation

// MARK: - Le placement d'un cadre de gloire dans la loi (#10154, L3)
//
// MIROIR de `packages/shared/types/glory-frames.ts` (`appliesTo`, `option`,
// `motifs`, `hidden`, `collection`) : ce que la loi de proposition (L4) lit pour
// choisir les cadres d'une étape. `appliesTo` porte les CLÉS de la loi, jamais
// un libellé, et doit dire la même chose que l'usage du cadre (#10146) : un
// cadre qui se contredit n'a pas de placement, donc ne se propose jamais.
//
// Les FORMATS du contrat (couches, emplacements de texte, oiseaux) se lisent au
// lot du peintre iOS (L8) ; ici, le placement seul.

/// La Meesh n° 1, puis l'édition de la pièce (argent, or à chaque centième, prisme à chaque millième).
public enum MeeshFrameEdition: String, CaseIterable, Codable, Sendable, Hashable {
    case first
    case silver
    case gold
    case prism
}

/// La cible d'un cadre : rang et division (`nil` : toutes les divisions, et le Mythe), palier, édition de Meesh,
/// palier du trésor, seuil de Flamme, réalisation du jour, rareté d'un succès (`nil` : le cadre neutre).
public enum GloryFrameAppliesTo: Sendable, Hashable {
    case rank(GloryRank, division: GloryDivision5?)
    case tier(LevelTierKey)
    case meesh(MeeshFrameEdition)
    case treasury(TreasuryTierKey)
    case flame(days: Int)
    case day
    case achievement(rarity: GameGlory.AchievementRarity?)

    /// `usageFitsAppliesTo` : la cible et l'usage disent-ils la même chose ?
    public func fits(_ usage: FrameUsage) -> Bool {
        switch (self, usage) {
        case let (.rank(rank, division), .rank(usageRank, usageDivision)):
            return rank == usageRank && (usageDivision == nil || usageDivision == division)
        case let (.achievement(rarity), .achievement(usageRarity)):
            return rarity == usageRarity
        case (.tier, .moment(.tier)), (.meesh, .moment(.meesh)), (.treasury, .moment(.treasury)),
             (.flame, .moment(.flame)), (.day, .moment(.day)):
            return true
        default:
            return false
        }
    }
}

extension GloryFrameAppliesTo: Decodable {
    private enum Keys: String, CodingKey { case family, rank, division, tier, edition, treasury, days, rarity }

    private enum Failure: Error { case mismatch }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        switch try c.decode(String.self, forKey: .family) {
        case "rank":
            let rank = try c.decode(GloryRank.self, forKey: .rank)
            guard c.contains(.division) else { throw Failure.mismatch }
            let division = try c.decodeIfPresent(GloryDivision5.self, forKey: .division)
            guard rank != .mythe || division == nil else { throw Failure.mismatch }
            self = .rank(rank, division: division)
        case "tier":
            self = .tier(try c.decode(LevelTierKey.self, forKey: .tier))
        case "meesh":
            self = .meesh(try c.decode(MeeshFrameEdition.self, forKey: .edition))
        case "treasury":
            self = .treasury(try c.decode(TreasuryTierKey.self, forKey: .treasury))
        case "flame":
            let days = try c.decode(Int.self, forKey: .days)
            guard GamePhotoCatchUpLaw.flameThresholds.contains(days) else { throw Failure.mismatch }
            self = .flame(days: days)
        case "day":
            self = .day
        case "achievement":
            guard c.contains(.rarity) else { throw Failure.mismatch }
            self = .achievement(rarity: try c.decodeIfPresent(GameGlory.AchievementRarity.self, forKey: .rarity))
        default:
            throw Failure.mismatch
        }
    }
}

/// Où un cadre se range : sa collection, sa cible, sa décoration (`V`…`I`, `A`/`B`/`C`, `a`/`b`/`c`), ses motifs,
/// et s'il est masqué des suggestions (jamais retiré : une photo gardée le cite encore).
public struct GloryFramePlacement: Sendable, Hashable {
    public let collection: String
    public let appliesTo: GloryFrameAppliesTo
    public let option: String?
    public let motifs: [String]
    public let hidden: Bool

    public init(collection: String, appliesTo: GloryFrameAppliesTo, option: String?, motifs: [String], hidden: Bool) {
        self.collection = collection
        self.appliesTo = appliesTo
        self.option = option
        self.motifs = motifs
        self.hidden = hidden
    }

    /// Le placement d'un cadre, s'il se lit, s'il appartient à sa collection et s'il ne contredit pas son usage.
    static func read(id: String, usage: FrameUsage, raw: Raw?) -> GloryFramePlacement? {
        guard let raw, id.hasPrefix("\(raw.collection)."), StickerPackTemplateID.isSlugShaped(raw.collection),
              raw.appliesTo.fits(usage) else { return nil }
        return GloryFramePlacement(collection: raw.collection, appliesTo: raw.appliesTo, option: raw.option,
                                   motifs: raw.motifs, hidden: raw.hidden)
    }

    struct Raw: Decodable {
        let collection: String
        let appliesTo: GloryFrameAppliesTo
        let option: String?
        let motifs: [String]
        let hidden: Bool
    }
}
