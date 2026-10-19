import Foundation

// MARK: - La loi d'usage des cadres (#10146)
//
// MIROIR de `packages/shared/types/frame-usage.ts` — un système UNIQUE,
// réutilisé par les cadres des appels vidéo, de la prise de photo et de vidéo,
// des rangs, du prestige, des succès et des moments du jeu. Chaque cadre
// DÉCLARE son usage ; chaque surface demande `FrameUsageLaw.canUseFrame` avant
// de le proposer, et chaque puce ou vignette affiche `describeFrameUsage`.
//
// Directive porteur 2026-10-11 : « le but est de développer un système
// réutilisé par les frames en appels vidéo, en prise de photo, pour compléter,
// et les frames proposés doivent indiquer quand c'est utilisable. Les frames
// libres photo, vidéo et appels vidéo ne peuvent pas s'appliquer pour les
// achievements, et un frame de rang ne peut être utilisé que pour le rang
// indiqué ! Un frame de prestige ne peut être utilisé que pour le prestige !
// Un frame appels vidéo ne peut être utilisé que pour les appels vidéo et la
// capture caméra hors appel vidéo, mais un frame uniquement pour la capture
// photo/vidéo ne peut pas être utilisé pour les appels vidéo (pour des
// questions peut-être de ressources). »
//
// Les vecteurs `packages/shared/design/packs/frame-usage-vectors.json` sont
// rejoués par `FrameUsageVectorTests` : sur divergence, le TS a raison.

/// Les surfaces d'un cadre LIBRE : l'appel vidéo en direct, la photo, la vidéo.
public enum FreeFrameSurface: String, CaseIterable, Codable, Sendable, Hashable {
    case call
    case photo
    case video
    /// Les contours d'avatar de profil (#10632) : une surface à part entière.
    case avatar
    /// Les cadres posés sur la photo de bannière (#10932) : une surface à part entière.
    case banner
}

/// Les familles de moments du jeu qu'un cadre de moment peut servir.
public enum FrameMomentFamily: String, CaseIterable, Codable, Sendable, Hashable {
    case tier
    case meesh
    case treasury
    case flame
    case day
    case level100 = "level-100"
}

/// Les surfaces déclarées par un cadre de capture d'appel (`design/call-capture-frames`).
public enum CaptureFrameSurface: String, CaseIterable, Codable, Sendable, Hashable {
    case capture
    case live
}

/// Le média d'une capture caméra hors appel.
public enum FrameCaptureMedia: String, CaseIterable, Codable, Sendable, Hashable {
    case photo
    case video
}

/// L'usage DÉCLARÉ d'un cadre. Fail-closed au décodage : un usage illisible ne se lit pas.
public enum FrameUsage: Sendable, Hashable {
    case free(surfaces: [FreeFrameSurface])
    case rank(GloryRank, division: GloryDivision5?)
    case prestige
    case achievement(rarity: GameGlory.AchievementRarity?)
    case moment(FrameMomentFamily)
}

/// Le contexte qui demande un cadre : l'appel, une capture, une étape du jeu.
public enum FrameUseContext: Sendable, Hashable {
    case call
    case avatar
    case banner
    case capture(FrameCaptureMedia)
    case rank(GloryRank, division: GloryDivision5?)
    case prestige
    case achievement(rarity: GameGlory.AchievementRarity?)
    case moment(FrameMomentFamily)
}

/// Le libellé « Utilisable : … » : une clé de `Localizable.xcstrings` (MeeshyUI)
/// et ses paramètres — des CLÉS (`rank`, `rarity`, `family`) que l'écran traduit,
/// sauf `division`, déjà en chiffres romains.
public struct FrameUsageLabel: Sendable, Hashable {
    public let key: String
    public let params: [String: String]

    public init(key: String, params: [String: String] = [:]) {
        self.key = key
        self.params = params
    }
}

public enum FrameUsageLaw {

    /// Les douze clés du libellé d'usage, identiques au web (`FRAME_USAGE_LABEL_KEYS`).
    public enum LabelKey {
        public static let callAndCapture = "frame.usage.callAndCapture"
        public static let captureOnly = "frame.usage.captureOnly"
        public static let photoOnly = "frame.usage.photoOnly"
        public static let videoOnly = "frame.usage.videoOnly"
        public static let rankOnly = "frame.usage.rankOnly"
        public static let rankDivisionOnly = "frame.usage.rankDivisionOnly"
        public static let prestigeOnly = "frame.usage.prestigeOnly"
        public static let achievementOnly = "frame.usage.achievementOnly"
        public static let achievementRarityOnly = "frame.usage.achievementRarityOnly"
        public static let momentOnly = "frame.usage.momentOnly"
        /// « Contour de profil uniquement » (#10632) — dans la table depuis #10715, comme côté TS.
        public static let avatarOnly = "frame.usage.avatarOnly"
        /// « Cadre de bannière uniquement » (#10932).
        public static let bannerFrameOnly = "frame.usage.bannerFrameOnly"

        public static let all: [String] = [
            callAndCapture, captureOnly, photoOnly, videoOnly, rankOnly,
            rankDivisionOnly, prestigeOnly, achievementOnly, achievementRarityOnly, momentOnly,
            avatarOnly, bannerFrameOnly,
        ]
    }

    /// LA règle : ce cadre peut-il servir ce contexte ? Un cadre libre ne sert
    /// jamais le jeu, un cadre du jeu ne sert que SON contexte.
    public static func canUseFrame(_ usage: FrameUsage, _ context: FrameUseContext) -> Bool {
        switch usage {
        case .free(let surfaces):
            return freeServes(surfaces, context)
        case .rank(let rank, let division):
            guard case .rank(let contextRank, let contextDivision) = context, contextRank == rank else { return false }
            return division == nil || division == contextDivision
        case .prestige:
            return context == .prestige
        case .achievement(let rarity):
            guard case .achievement(let contextRarity) = context else { return false }
            return rarity == nil || rarity == contextRarity
        case .moment(let family):
            return context == .moment(family)
        }
    }

    /// Un cadre d'appel vidéo sert aussi la capture photo et vidéo hors appel ;
    /// un cadre de capture seule ne sert JAMAIS l'appel (ressources du direct).
    private static func freeServes(_ surfaces: [FreeFrameSurface], _ context: FrameUseContext) -> Bool {
        switch context {
        case .call:
            return surfaces.contains(.call)
        case .avatar:
            return surfaces.contains(.avatar)
        case .banner:
            return surfaces.contains(.banner)
        case .capture(let media):
            return surfaces.contains(.call) || surfaces.contains(media == .photo ? .photo : .video)
        case .rank, .prestige, .achievement, .moment:
            return false
        }
    }

    public static func describeFrameUsage(_ usage: FrameUsage) -> FrameUsageLabel {
        switch usage {
        case .free(let surfaces):
            return FrameUsageLabel(key: freeLabel(surfaces))
        case .rank(let rank, nil):
            return FrameUsageLabel(key: LabelKey.rankOnly, params: ["rank": rank.rawValue])
        case .rank(let rank, let division?):
            return FrameUsageLabel(key: LabelKey.rankDivisionOnly, params: ["rank": rank.rawValue, "division": division.roman])
        case .prestige:
            return FrameUsageLabel(key: LabelKey.prestigeOnly)
        case .achievement(nil):
            return FrameUsageLabel(key: LabelKey.achievementOnly)
        case .achievement(let rarity?):
            return FrameUsageLabel(key: LabelKey.achievementRarityOnly, params: ["rarity": rarity.rawValue])
        case .moment(let family):
            return FrameUsageLabel(key: LabelKey.momentOnly, params: ["family": family.rawValue])
        }
    }

    private static func freeLabel(_ surfaces: [FreeFrameSurface]) -> String {
        if surfaces == [.avatar] { return LabelKey.avatarOnly }
        if surfaces == [.banner] { return LabelKey.bannerFrameOnly }
        if surfaces.contains(.call) { return LabelKey.callAndCapture }
        if surfaces.contains(.photo) && surfaces.contains(.video) { return LabelKey.captureOnly }
        return surfaces.contains(.photo) ? LabelKey.photoOnly : LabelKey.videoOnly
    }

    /// La projection d'un cadre de capture d'appel : `live` ⇒ appel ET capture,
    /// `capture` seul (ou rien de déclaré) ⇒ capture photo et vidéo, jamais l'appel.
    public static func captureFrameUsage(_ surfaces: [CaptureFrameSurface]?) -> FrameUsage {
        surfaces?.contains(.live) == true
            ? .free(surfaces: [.call, .photo, .video])
            : .free(surfaces: [.photo, .video])
    }
}

// MARK: - Codable : la forme du fil, fail-closed

public enum FrameUsageDecodingError: Error, Equatable {
    case emptySurfaces
    case duplicateSurfaces
    /// Le Mythe n'a pas de division, et tout autre rang en a une dans un contexte.
    case divisionMismatch
}

private enum FrameUsageCodingKeys: String, CodingKey {
    case kind, surfaces, rank, division, rarity, family, media
}

extension FrameUsage: Codable {

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: FrameUsageCodingKeys.self)
        let kind = try container.decode(String.self, forKey: .kind)
        switch kind {
        case "free":
            let surfaces = try container.decode([FreeFrameSurface].self, forKey: .surfaces)
            guard !surfaces.isEmpty else { throw FrameUsageDecodingError.emptySurfaces }
            guard Set(surfaces).count == surfaces.count else { throw FrameUsageDecodingError.duplicateSurfaces }
            self = .free(surfaces: surfaces)
        case "rank":
            let rank = try container.decode(GloryRank.self, forKey: .rank)
            let division = try container.decodeIfPresent(GloryDivision5.self, forKey: .division)
            guard rank != .mythe || division == nil else { throw FrameUsageDecodingError.divisionMismatch }
            self = .rank(rank, division: division)
        case "prestige":
            self = .prestige
        case "achievement":
            self = .achievement(rarity: try container.decodeIfPresent(GameGlory.AchievementRarity.self, forKey: .rarity))
        case "moment":
            self = .moment(try container.decode(FrameMomentFamily.self, forKey: .family))
        default:
            throw DecodingError.dataCorruptedError(forKey: .kind, in: container, debugDescription: "usage de cadre inconnu : \(kind)")
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: FrameUsageCodingKeys.self)
        switch self {
        case .free(let surfaces):
            try container.encode("free", forKey: .kind)
            try container.encode(surfaces, forKey: .surfaces)
        case .rank(let rank, let division):
            try container.encode("rank", forKey: .kind)
            try container.encode(rank, forKey: .rank)
            try container.encodeIfPresent(division, forKey: .division)
        case .prestige:
            try container.encode("prestige", forKey: .kind)
        case .achievement(let rarity):
            try container.encode("achievement", forKey: .kind)
            try container.encodeIfPresent(rarity, forKey: .rarity)
        case .moment(let family):
            try container.encode("moment", forKey: .kind)
            try container.encode(family, forKey: .family)
        }
    }
}

extension FrameUseContext: Codable {

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: FrameUsageCodingKeys.self)
        let kind = try container.decode(String.self, forKey: .kind)
        switch kind {
        case "call":
            self = .call
        case "avatar":
            self = .avatar
        case "banner":
            self = .banner
        case "capture":
            self = .capture(try container.decode(FrameCaptureMedia.self, forKey: .media))
        case "rank":
            let rank = try container.decode(GloryRank.self, forKey: .rank)
            let division: GloryDivision5? = try container.decodeNil(forKey: .division)
                ? nil
                : try container.decode(GloryDivision5.self, forKey: .division)
            guard (rank == .mythe) == (division == nil) else { throw FrameUsageDecodingError.divisionMismatch }
            self = .rank(rank, division: division)
        case "prestige":
            self = .prestige
        case "achievement":
            self = .achievement(rarity: try container.decodeIfPresent(GameGlory.AchievementRarity.self, forKey: .rarity))
        case "moment":
            self = .moment(try container.decode(FrameMomentFamily.self, forKey: .family))
        default:
            throw DecodingError.dataCorruptedError(forKey: .kind, in: container, debugDescription: "contexte de cadre inconnu : \(kind)")
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: FrameUsageCodingKeys.self)
        switch self {
        case .call:
            try container.encode("call", forKey: .kind)
        case .avatar:
            try container.encode("avatar", forKey: .kind)
        case .banner:
            try container.encode("banner", forKey: .kind)
        case .capture(let media):
            try container.encode("capture", forKey: .kind)
            try container.encode(media, forKey: .media)
        case .rank(let rank, let division):
            try container.encode("rank", forKey: .kind)
            try container.encode(rank, forKey: .rank)
            try container.encode(division, forKey: .division)
        case .prestige:
            try container.encode("prestige", forKey: .kind)
        case .achievement(let rarity):
            try container.encode("achievement", forKey: .kind)
            try container.encodeIfPresent(rarity, forKey: .rarity)
        case .moment(let family):
            try container.encode("moment", forKey: .kind)
            try container.encode(family, forKey: .family)
        }
    }
}
