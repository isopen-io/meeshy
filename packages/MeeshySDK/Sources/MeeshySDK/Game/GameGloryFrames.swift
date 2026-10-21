import Foundation

// MARK: - La loi de proposition des cadres de gloire (#10156, L4)
//
// MIROIR de `packages/shared/utils/game/glory-frames.ts` (`gloryFramesFor`) :
// pour chaque étape du jeu, quels cadres proposer d'abord, selon l'atmosphère
// choisie, le dernier choix et les packs installés. Moteur de règles SANS ÉTAT :
// ni horloge, ni réseau, ni stockage — l'appelant remet le catalogue (contrats
// des packs `glory-frame`), l'atmosphère du compte, le dernier cadre gardé pour
// la même famille et l'ensemble des packs installés OU embarqués, calculé par
// l'étagère, jamais redérivé ici.
//
// La loi d'usage (#10146) borne tout ce qui sort : chaque cadre proposé passe
// `FrameUsageLaw.canUseFrame`. Rejoué sur `packages/shared/design/packs/frame-offer-vectors.json`
// par `GloryFrameOfferVectorTests` : sur divergence, le TS a raison.

/// Un cadre tel que la loi le lit : son identité, son usage et son placement.
public struct GloryFrameOfferFrame: Sendable, Hashable {
    public let id: String
    public let usage: FrameUsage
    public let placement: GloryFramePlacement

    public init(id: String, usage: FrameUsage, placement: GloryFramePlacement) {
        self.id = id
        self.usage = usage
        self.placement = placement
    }

    /// Un cadre de contrat sans placement lisible ne se propose jamais.
    public init?(_ frame: GloryFramePackFrame) {
        guard let placement = frame.placement else { return nil }
        self.init(id: frame.id, usage: frame.usage, placement: placement)
    }
}

/// Un pack du catalogue, dans l'ordre éditorial du registre ; `atmosphere` est la clé (`afrique`, `olympe`…) ou `nil`.
public struct GloryFrameOfferPack: Sendable, Hashable {
    public let slug: String
    public let atmosphere: String?
    public let collections: [String]
    public let frames: [GloryFrameOfferFrame]

    public init(slug: String, atmosphere: String?, collections: [String], frames: [GloryFrameOfferFrame]) {
        self.slug = slug
        self.atmosphere = atmosphere
        self.collections = collections
        self.frames = frames
    }
}

public struct GloryFrameRef: Sendable, Hashable {
    public let pack: String
    public let frameId: String

    public init(pack: String, frameId: String) {
        self.pack = pack
        self.frameId = frameId
    }
}

public struct GloryFrameOtherPack: Sendable, Hashable {
    public let pack: String
    public let atmosphere: String?
    public let installed: Bool
    public let frames: [GloryFrameRef]
}

public struct GloryFramesOffer: Sendable, Hashable {
    public let needsAtmosphere: Bool
    public let suggested: [GloryFrameRef]
    public let others: [GloryFrameOtherPack]
    public let reinstall: String?
    public let preselected: GloryFrameRef?

    static let nothing = GloryFramesOffer(needsAtmosphere: false, suggested: [], others: [], reinstall: nil, preselected: nil)
}

public enum GameGloryFrames {
    /// L'atmosphère de « Choisir plus tard », installée par défaut et non retirable.
    public static let defaultAtmosphere = "afrique"

    /// Les rangs qui se photographient dans une atmosphère ; les rangs d'avant ont leurs mythologies.
    static let atmosphereRanks: Set<GloryRank> = [.ambassadeur, .orateur, .oracle, .legende, .mythe]

    /// `GLORY_FRAME_OFFER_EXEMPT_FAMILIES` : les familles d'étapes sans cadre à proposer aujourd'hui.
    public static let exemptFamilies = [
        "rank:murmure", "rank:echo", "rank:voix", "rank:conteur", "rank:passeur", "rank:polyglotte",
        "start", "level-100", "prestige", "trophy", "achievement",
    ]

    enum StepTarget: Equatable {
        case rank(GloryRank, division: GloryDivision5?)
        case tier(LevelTierKey)
        case meesh(MeeshFrameEdition)
        case treasury(String)
        case flame(days: Int)
        case day
        case achievement
        case level100
        case prestige
        case none
    }

    private static func positive(_ raw: String?) -> Int? {
        guard let raw, let first = raw.first, first != "0", raw.allSatisfy({ $0.isASCII && $0.isNumber }),
              let value = Int(raw), value > 0 else { return nil }
        return value
    }

    static func stepTarget(_ stepId: String) -> StepTarget {
        let parts = stepId.split(separator: ":", omittingEmptySubsequences: false).map(String.init)
        let first = parts.count > 1 ? parts[1] : nil
        let second = parts.count > 2 ? parts[2] : nil
        switch parts.first {
        case "rank":
            guard let first, let rank = GloryRank(rawValue: first) else { return .none }
            if rank == .mythe { return second == "0" ? .rank(.mythe, division: nil) : .none }
            guard let second, second.count == 1, let raw = Int(second), let division = GloryDivision5(rawValue: raw) else { return .none }
            return .rank(rank, division: division)
        case "tier":
            return first.flatMap(LevelTierKey.init(rawValue:)).map(StepTarget.tier) ?? .none
        case "meesh":
            guard let number = positive(first) else { return .none }
            if number == 1 { return .meesh(.first) }
            switch GameMint.edition(forNumber: number) {
            case .silver: return .meesh(.silver)
            case .gold: return .meesh(.gold)
            case .prism: return .meesh(.prism)
            }
        case "treasury":
            return first.map(StepTarget.treasury) ?? .none
        case "flame":
            return positive(first).map { .flame(days: $0) } ?? .none
        case "day":
            return .day
        case "achievement":
            return .achievement
        case "level-100":
            return .level100
        case "prestige":
            return .prestige
        default:
            return .none
        }
    }

    /// `frameUseContextOf` : le contexte de la loi d'usage pour une étape ; `nil` : aucun cadre ne la sert.
    public static func useContext(stepId: String, rarity: GameGlory.AchievementRarity?) -> FrameUseContext? {
        switch stepTarget(stepId) {
        case let .rank(rank, division): return .rank(rank, division: division)
        case .tier: return .moment(.tier)
        case .meesh: return .moment(.meesh)
        case .treasury: return .moment(.treasury)
        case .flame: return .moment(.flame)
        case .day: return .moment(.day)
        case .level100: return .moment(.level100)
        case .prestige: return .prestige
        case .achievement: return .achievement(rarity: rarity)
        case .none: return nil
        }
    }

    private static func ref(_ pack: GloryFrameOfferPack, _ frame: GloryFrameOfferFrame) -> GloryFrameRef {
        GloryFrameRef(pack: pack.slug, frameId: frame.id)
    }

    private static func byCollection(_ pack: GloryFrameOfferPack, _ frames: [GloryFrameOfferFrame], lastChosen: String?) -> [GloryFrameOfferFrame] {
        let chosen = pack.frames.first { $0.id == lastChosen }?.placement.collection
        let order = chosen.map { chosen in [chosen] + pack.collections.filter { $0 != chosen } } ?? pack.collections
        return order.flatMap { collection in frames.filter { $0.placement.collection == collection } }
    }

    private static func rankFrames(_ pack: GloryFrameOfferPack, rank: GloryRank, division: GloryDivision5?, lastChosen: String?) -> [GloryFrameOfferFrame] {
        let ofRank = byCollection(pack, pack.frames.filter {
            if case let .rank(frameRank, _) = $0.placement.appliesTo { return frameRank == rank }
            return false
        }, lastChosen: lastChosen)
        let sameDivision: (GloryFrameOfferFrame) -> Bool = { frame in
            if case let .rank(_, frameDivision) = frame.placement.appliesTo { return frameDivision != nil && frameDivision == division }
            return false
        }
        return ofRank.filter(sameDivision) + ofRank.filter { !sameDivision($0) }
    }

    private static func matches(_ target: StepTarget, rarity: GameGlory.AchievementRarity?) -> (GloryFrameOfferFrame) -> Bool {
        { frame in
            switch (target, frame.placement.appliesTo) {
            case let (.tier(wanted), .tier(tier)): return wanted == tier
            case let (.meesh(wanted), .meesh(edition)): return wanted == edition
            case let (.treasury(wanted), .treasury(tier)): return wanted == tier.rawValue
            case let (.flame(wanted), .flame(days)): return wanted == days
            case (.day, .day): return true
            case let (.achievement, .achievement(frameRarity)): return frameRarity == rarity
            default: return false
            }
        }
    }

    /// D4 : un palier sans cadre dessiné prend celui du palier dessiné le plus proche EN DESSOUS.
    private static func drawnTier(_ tier: LevelTierKey, frames: [GloryFrameOfferFrame]) -> StepTarget {
        let all = LevelTierKey.allCases
        guard let index = all.firstIndex(of: tier) else { return .tier(tier) }
        let drawn = all[...index].reversed().first { candidate in
            frames.contains { if case let .tier(frameTier) = $0.placement.appliesTo { return frameTier == candidate }; return false }
        }
        return .tier(drawn ?? tier)
    }

    private static func preselect(_ suggested: [GloryFrameRef], lastChosen: String?) -> GloryFrameRef? {
        suggested.first { $0.frameId == lastChosen } ?? suggested.first
    }

    /// LA loi : les cadres proposés pour une étape.
    public static func framesFor(stepId: String, atmosphere: String?, lastChosen: String?, catalog: [GloryFrameOfferPack],
                                 installed: Set<String>, rarity: GameGlory.AchievementRarity? = nil) -> GloryFramesOffer {
        guard let context = useContext(stepId: stepId, rarity: rarity) else { return .nothing }
        let packs = catalog.map { pack in
            GloryFrameOfferPack(slug: pack.slug, atmosphere: pack.atmosphere, collections: pack.collections,
                                frames: pack.frames.filter { !$0.placement.hidden && FrameUsageLaw.canUseFrame($0.usage, context) })
        }
        let ready = packs.filter { installed.contains($0.slug) }
        let target = stepTarget(stepId)
        if case let .rank(rank, division) = target {
            if atmosphereRanks.contains(rank) {
                return atmosphereOffer(rank: rank, division: division, atmosphere: atmosphere, lastChosen: lastChosen, packs: packs, installed: installed)
            }
            let suggested = ready.filter { $0.atmosphere == nil }.flatMap { pack in
                rankFrames(pack, rank: rank, division: division, lastChosen: lastChosen).map { ref(pack, $0) }
            }
            return GloryFramesOffer(needsAtmosphere: false, suggested: suggested, others: [], reinstall: nil,
                                    preselected: preselect(suggested, lastChosen: lastChosen))
        }
        let effective: StepTarget
        if case let .tier(tier) = target { effective = drawnTier(tier, frames: ready.flatMap(\.frames)) } else { effective = target }
        let matching: (GameGlory.AchievementRarity?) -> [GloryFrameRef] = { wanted in
            ready.flatMap { pack in byCollection(pack, pack.frames.filter(matches(effective, rarity: wanted)), lastChosen: lastChosen).map { ref(pack, $0) } }
        }
        let own = matching(rarity)
        let suggested = own.isEmpty && target == .achievement && rarity != nil ? matching(nil) : own
        return GloryFramesOffer(needsAtmosphere: false, suggested: suggested, others: [], reinstall: nil,
                                preselected: preselect(suggested, lastChosen: lastChosen))
    }

    private static func atmosphereOffer(rank: GloryRank, division: GloryDivision5?, atmosphere: String?, lastChosen: String?,
                                        packs: [GloryFrameOfferPack], installed: Set<String>) -> GloryFramesOffer {
        let atmospheric = packs.filter { $0.atmosphere != nil }
        let chosen = atmosphere.flatMap { wanted in atmospheric.first { $0.atmosphere == wanted } }
        let chosenReady = chosen.map { installed.contains($0.slug) } ?? false
        let reinstall = chosen.flatMap { chosenReady ? nil : $0.slug }
        let base = chosenReady ? chosen : atmospheric.first { $0.atmosphere == defaultAtmosphere }
        let framesOf: (GloryFrameOfferPack) -> [GloryFrameRef] = { pack in
            rankFrames(pack, rank: rank, division: division, lastChosen: lastChosen).map { ref(pack, $0) }
        }
        let suggested = base.map { installed.contains($0.slug) ? framesOf($0) : [] } ?? []
        let others = atmospheric
            .filter { $0.slug != base?.slug }
            .map { GloryFrameOtherPack(pack: $0.slug, atmosphere: $0.atmosphere, installed: installed.contains($0.slug), frames: framesOf($0)) }
            .filter { !$0.frames.isEmpty }
        return GloryFramesOffer(needsAtmosphere: atmosphere == nil, suggested: suggested, others: others, reinstall: reinstall,
                                preselected: preselect(suggested, lastChosen: lastChosen))
    }
}
