import Foundation

// MARK: - Le registre des moments photo (#20649, tranche iOS de #20643)
//
// MIROIR de `gamePhotoBlockSchema` (`packages/shared/types/game-photo.ts`) : l'extension `game.photo` du bloc `game`.
// Une ligne de base ou un palier illisible vaut « aucun » ; tout autre champ illisible fait tomber le bloc SEUL
// (`GameWave2`), le reste du jeu reste lu. Ce que le registre dit déjà présenté ne s'annonce plus
// (`GamePhotoAlerts.alert`), et l'accusé d'une présentation part par lots (`presentedBatches`).

/// « Me proposer d'immortaliser » : le réglage de COMPTE (`PHOTO_INVITATIONS`).
public enum PhotoInvitationsSetting: String, Codable, Sendable, CaseIterable {
    case every, major, never

    /// Le réglage dans les mots de la loi des alertes (`invitationsPolicy` du web).
    public var policy: PhotoAlertPolicy {
        let standard = PhotoAlertPolicy.standard
        let invitations: PhotoAlertPolicy.Invitations = switch self {
        case .every: .everyStep
        case .major: .bigMoments
        case .never: .never
        }
        return PhotoAlertPolicy(photographs: standard.photographs, invitations: invitations, backlog: standard.backlog,
                                inApp: standard.inApp, push: standard.push)
    }
}

/// Une ligne du registre : quand l'étape a été détectée, présentée, notifiée, immortalisée.
public struct GamePhotoMomentRow: Codable, Sendable, Equatable {
    public let stepId: String
    public let detectedAt: String?
    public let presentedAt: String?
    public let notifiedAt: String?
    /// Absente d'un serveur d'avant le signal « immortalisée » : `nil`.
    public let keptAt: String?

    public init(stepId: String, detectedAt: String?, presentedAt: String?, notifiedAt: String?, keptAt: String?) {
        self.stepId = stepId
        self.detectedAt = detectedAt
        self.presentedAt = presentedAt
        self.notifiedAt = notifiedAt
        self.keptAt = keptAt
    }

    private enum CodingKeys: String, CodingKey {
        case stepId, detectedAt, presentedAt, notifiedAt, keptAt
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let stepId = try container.decode(String.self, forKey: .stepId)
        guard GamePhotoRegistry.isStepId(stepId) else {
            throw DecodingError.dataCorruptedError(forKey: .stepId, in: container, debugDescription: "identité d'étape illisible")
        }
        self.stepId = stepId
        detectedAt = try container.decodeIfPresent(String.self, forKey: .detectedAt)
        presentedAt = try container.decodeIfPresent(String.self, forKey: .presentedAt)
        notifiedAt = try container.decodeIfPresent(String.self, forKey: .notifiedAt)
        keptAt = try container.decodeIfPresent(String.self, forKey: .keptAt)
    }
}

/// L'extension `game.photo` : réglages de compte, ligne de base des alertes et registre des étapes.
public struct GamePhotoBlock: Codable, Sendable, Equatable {
    public let atmosphere: String?
    public let invitations: PhotoInvitationsSetting
    public let baselineAt: String?
    /// La situation à la ligne de base ; illisible, elle vaut « aucune ».
    public let baseline: PhotoCatchUpStanding?
    /// Le plus haut palier du trésor jamais atteint ; illisible, il vaut « aucun ».
    public let treasuryPeakTier: TreasuryTierKey?
    public let moments: [GamePhotoMomentRow]

    public init(atmosphere: String?, invitations: PhotoInvitationsSetting, baselineAt: String?,
                baseline: PhotoCatchUpStanding?, treasuryPeakTier: TreasuryTierKey?, moments: [GamePhotoMomentRow]) {
        self.atmosphere = atmosphere
        self.invitations = invitations
        self.baselineAt = baselineAt
        self.baseline = baseline
        self.treasuryPeakTier = treasuryPeakTier
        self.moments = moments
    }

    /// La politique des alertes que le réglage du compte demande.
    public var policy: PhotoAlertPolicy { invitations.policy }

    /// Présentées, notifiées ou immortalisées : ces étapes ne s'annoncent plus (miroir de `decide` du web).
    public var presentedStepIds: [String] {
        moments.filter { $0.presentedAt != nil || $0.notifiedAt != nil || $0.keptAt != nil }.map(\.stepId)
    }

    /// Immortalisées sur un appareil : elles sortent de « À rattraper » partout.
    public var keptStepIds: [String] {
        moments.filter { $0.keptAt != nil }.map(\.stepId)
    }

    private enum CodingKeys: String, CodingKey {
        case atmosphere, invitations, baselineAt, baseline, treasuryPeakTier, moments
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        atmosphere = try container.decodeIfPresent(String.self, forKey: .atmosphere)
        invitations = try container.decode(PhotoInvitationsSetting.self, forKey: .invitations)
        baselineAt = try container.decodeIfPresent(String.self, forKey: .baselineAt)
        baseline = ((try? container.decodeIfPresent(StandingPayload.self, forKey: .baseline)) ?? nil)?.standing
        treasuryPeakTier = (try? container.decodeIfPresent(TreasuryTierKey.self, forKey: .treasuryPeakTier)) ?? nil
        let moments = try container.decode([GamePhotoMomentRow].self, forKey: .moments)
        guard moments.count <= GamePhotoRegistry.servedMax else {
            throw DecodingError.dataCorruptedError(forKey: .moments, in: container, debugDescription: "registre trop long")
        }
        self.moments = moments
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(atmosphere, forKey: .atmosphere)
        try container.encode(invitations, forKey: .invitations)
        try container.encode(baselineAt, forKey: .baselineAt)
        try container.encode(baseline.map(StandingPayload.init(standing:)), forKey: .baseline)
        try container.encode(treasuryPeakTier, forKey: .treasuryPeakTier)
        try container.encode(moments, forKey: .moments)
    }
}

/// `PhotoCatchUpStandingPayload` : la ligne de base telle qu'elle voyage. Un rang ou une division inconnus la rendent
/// illisible, comme `servedBaseline` du web.
private struct StandingPayload: Codable {
    let rank: String
    let division: Int?
    let levelRecord: Int
    let prestige: Int
    let minted: Int
    let treasuryTier: String?
    let flameRecord: Int
    let pastCycleRecords: [Int]?

    init(standing: PhotoCatchUpStanding) {
        rank = standing.rank.rawValue
        division = standing.division?.rawValue
        levelRecord = standing.levelRecord
        prestige = standing.prestige
        minted = standing.minted
        treasuryTier = standing.treasuryTier?.rawValue
        flameRecord = standing.flameRecord
        pastCycleRecords = standing.pastCycleRecords
    }

    var standing: PhotoCatchUpStanding? {
        guard let rank = GloryRank(rawValue: rank),
              [levelRecord, prestige, minted, flameRecord].allSatisfy({ $0 >= 0 }),
              (pastCycleRecords ?? []).allSatisfy({ $0 >= 0 }) else { return nil }
        let division = division.map(GloryDivision5.init(rawValue:))
        let tier = treasuryTier.map(TreasuryTierKey.init(rawValue:))
        if case .some(.none) = division { return nil }
        if case .some(.none) = tier { return nil }
        return PhotoCatchUpStanding(rank: rank, division: division ?? nil, levelRecord: levelRecord, prestige: prestige,
                                    minted: minted, treasuryTier: tier ?? nil, flameRecord: flameRecord,
                                    pastCycleRecords: pastCycleRecords)
    }
}

public enum GamePhotoRegistry {
    /// `PHOTO_MOMENTS_SERVED_MAX` : le registre servi porte au plus ces lignes.
    public static let servedMax = 64
    /// `PHOTO_PRESENTED_MAX` : un accusé porte au plus ces étapes.
    public static let presentedMax = 64

    private static let stepIdPattern = "^[A-Za-z0-9][A-Za-z0-9:._-]{0,95}$"

    /// `PHOTO_STEP_ID_PATTERN`.
    public static func isStepId(_ value: String) -> Bool {
        value.range(of: stepIdPattern, options: .regularExpression) != nil
    }

    /// Les lots d'un accusé : étapes valides, sans doublon, dans l'ordre, `presentedMax` au plus par lot.
    public static func presentedBatches(_ stepIds: [String]) -> [[String]] {
        var seen = Set<String>()
        let valid = stepIds.filter { isStepId($0) && seen.insert($0).inserted }
        return stride(from: 0, to: valid.count, by: presentedMax).map {
            Array(valid[$0..<min($0 + presentedMax, valid.count)])
        }
    }
}
