import Foundation

// MARK: - Mee et Meo, les guides du jeu (#9373)
//
// MIROIR de `packages/shared/utils/game/guide.ts` — la loi qui choisit le moment.
//
// Comme `mascotMoment`, cette loi ne dit RIEN en toutes lettres : elle rend une
// clé stable, un locuteur, une humeur, les chiffres du moment, l'étape d'après,
// et si le moment se montre EN ENTIER (la première fois) ou en version COURTE.
// Les clients habillent le personnage et localisent, dans les sept langues, la
// même chose au même moment.
//
// Les clés « déjà vues » sont les clés des moments (`GuideMomentKey`) et, pour
// l'intégration, `GameGuide.onboardingSeenKey(_:)` ; le serveur les garde
// (`POST /me/game/guide/seen`) et les sert dans `game.guideSeen`.
//
// Une seule carte par ouverture d'écran (`chooseMoment`). Jamais dans une
// conversation : seulement sur Progression, après une célébration et pendant
// l'intégration — c'est une règle d'AFFICHAGE, que la loi ne peut pas tenir.

public enum GuideSpeaker: String, CaseIterable, Codable, Sendable, Hashable {
    case mee
    case meo
    case duo
}

/// `cheer` à `counting` reprennent `MascotMood` ; `calm`, `sad` et `proud` sont propres aux guides.
public enum GuideMood: String, CaseIterable, Codable, Sendable, Hashable {
    case cheer
    case minting
    case ready
    case guide
    case streak
    case counting
    case calm
    case sad
    case proud
}

/// Le bouton qui mène à l'étape d'après — le client en fait un lien profond.
public enum GuideAction: String, CaseIterable, Codable, Sendable, Hashable {
    case startGame = "start-game"
    case earnFirstPoints = "earn-first-points"
    case seeLevel = "see-level"
    case seeMissions = "see-missions"
    case seeFlame = "see-flame"
    case seeMeeshes = "see-meeshes"
    case seeRank = "see-rank"
    case takeStartPhoto = "take-start-photo"
    case seeProgress = "see-progress"
    case seeNextTier = "see-next-tier"
    case openFirstMission = "open-first-mission"
    case mintOrClimb = "mint-or-climb"
    case regainLevels = "regain-levels"
    case relightBadge = "relight-badge"
    case seeMintPreview = "see-mint-preview"
    case takePhoto = "take-photo"
    case keepOrSpend = "keep-or-spend"
    case doEasyMissionOrFreeze = "do-easy-mission-or-freeze"
    case relightFlame = "relight-flame"
    case doEasiestMission = "do-easiest-mission"
    case prestigeOrStay = "prestige-or-stay"
}

public enum OnboardingStepKey: String, CaseIterable, Codable, Sendable, Hashable {
    case welcome
    case firstPoints = "first-points"
    case levels
    case missions
    case flame
    case mint
    case rank
}

public struct OnboardingStep: Sendable, Equatable {
    public let key: OnboardingStepKey
    /// 1 à 7.
    public let index: Int
    public let speaker: GuideSpeaker
    public let mood: GuideMood
    public let action: GuideAction

    public init(key: OnboardingStepKey, index: Int, speaker: GuideSpeaker, mood: GuideMood, action: GuideAction) {
        self.key = key
        self.index = index
        self.speaker = speaker
        self.mood = mood
        self.action = action
    }
}

/// Les treize moments, par leur clé stable.
public enum GuideMomentKey: String, CaseIterable, Codable, Sendable, Hashable {
    case firstLevel = "first-level"
    case newTier = "new-tier"
    case missionsUnlocked = "missions-unlocked"
    case firstMintPossible = "first-mint-possible"
    case firstMint = "first-mint"
    case badgeExtinguished = "badge-extinguished"
    case priceRises = "price-rises"
    case newRank = "new-rank"
    case treasuryTier = "treasury-tier"
    case flameAtRisk = "flame-at-risk"
    case flameOut = "flame-out"
    case returnAfterAbsence = "return-after-absence"
    case level100 = "level-100"
}

/// Ce qui vient d'arriver au joueur, avec les chiffres que le moment cite.
public enum GuideEvent: Sendable, Equatable {
    case firstLevel(level: Int, pointsToNext: Int)
    case newTier(tier: LevelTierKey, nextTierLevel: Int?)
    case missionsUnlocked
    case firstMintPossible(price: Int, levelsLost: Int, gloryGain: Int)
    case firstMint(levelBefore: Int, levelAfter: Int, tailwindUntilLevel: Int)
    case badgeExtinguished(missingActions: Int)
    case priceRises(nextPrice: Int)
    case newRank(rank: GloryRank, division: GloryDivision5?, glory: Int, gloryMissing: Int?)
    case treasuryTier(tier: TreasuryTierKey, nextTierMissing: Int?)
    case flameAtRisk(days: Int)
    case flameOut(lostDays: Int, relightPrice: Int, canRelight: Bool)
    case returnAfterAbsence(daysAway: Int)
    case level100(canPrestige: Bool)

    public var key: GuideMomentKey {
        switch self {
        case .firstLevel: .firstLevel
        case .newTier: .newTier
        case .missionsUnlocked: .missionsUnlocked
        case .firstMintPossible: .firstMintPossible
        case .firstMint: .firstMint
        case .badgeExtinguished: .badgeExtinguished
        case .priceRises: .priceRises
        case .newRank: .newRank
        case .treasuryTier: .treasuryTier
        case .flameAtRisk: .flameAtRisk
        case .flameOut: .flameOut
        case .returnAfterAbsence: .returnAfterAbsence
        case .level100: .level100
        }
    }
}

public enum GuidePresentation: String, Codable, Sendable, Hashable {
    /// La première fois.
    case full
    /// La clé est déjà vue — « ? » rouvre toujours la version complète.
    case short
}

public struct GuideMoment: Sendable, Equatable {
    public let key: GuideMomentKey
    public let speaker: GuideSpeaker
    public let mood: GuideMood
    /// Les chiffres du moment.
    public let event: GuideEvent
    public let action: GuideAction
    public let presentation: GuidePresentation

    public init(key: GuideMomentKey, speaker: GuideSpeaker, mood: GuideMood, event: GuideEvent,
                action: GuideAction, presentation: GuidePresentation) {
        self.key = key
        self.speaker = speaker
        self.mood = mood
        self.event = event
        self.action = action
        self.presentation = presentation
    }
}

public enum GameGuide {

    // MARK: L'intégration en sept étapes

    public static let onboardingSteps: [OnboardingStep] = [
        step(.welcome, .mee, .guide, .earnFirstPoints),
        step(.firstPoints, .mee, .cheer, .seeLevel),
        step(.levels, .meo, .guide, .seeMissions),
        step(.missions, .mee, .ready, .seeFlame),
        step(.flame, .meo, .calm, .seeMeeshes),
        step(.mint, .duo, .minting, .seeRank),
        step(.rank, .meo, .guide, .takeStartPhoto),
    ]

    private static func step(_ key: OnboardingStepKey, _ speaker: GuideSpeaker, _ mood: GuideMood,
                             _ action: GuideAction) -> OnboardingStep {
        let index = (OnboardingStepKey.allCases.firstIndex(of: key) ?? 0) + 1
        return OnboardingStep(key: key, index: index, speaker: speaker, mood: mood, action: action)
    }

    public static func onboardingSeenKey(_ key: OnboardingStepKey) -> String {
        "onboarding.\(key.rawValue)"
    }

    /// La première étape non vue, `nil` quand l'intégration est terminée.
    public static func nextOnboardingStep<Seen: Sequence>(seen: Seen) -> OnboardingStep? where Seen.Element == String {
        let done = Set(seen)
        return onboardingSteps.first { !done.contains(onboardingSeenKey($0.key)) }
    }

    // MARK: Les moments

    private struct Persona {
        let speaker: GuideSpeaker
        let mood: GuideMood
        let action: GuideAction
    }

    private static func persona(of key: GuideMomentKey) -> Persona {
        switch key {
        case .firstLevel: Persona(speaker: .mee, mood: .cheer, action: .seeProgress)
        case .newTier: Persona(speaker: .duo, mood: .cheer, action: .seeNextTier)
        case .missionsUnlocked: Persona(speaker: .mee, mood: .guide, action: .openFirstMission)
        case .firstMintPossible: Persona(speaker: .meo, mood: .ready, action: .mintOrClimb)
        case .firstMint: Persona(speaker: .duo, mood: .minting, action: .regainLevels)
        case .badgeExtinguished: Persona(speaker: .meo, mood: .calm, action: .relightBadge)
        case .priceRises: Persona(speaker: .meo, mood: .calm, action: .seeMintPreview)
        case .newRank: Persona(speaker: .duo, mood: .proud, action: .takePhoto)
        case .treasuryTier: Persona(speaker: .mee, mood: .cheer, action: .keepOrSpend)
        case .flameAtRisk: Persona(speaker: .meo, mood: .calm, action: .doEasyMissionOrFreeze)
        case .flameOut: Persona(speaker: .meo, mood: .sad, action: .relightFlame)
        case .returnAfterAbsence: Persona(speaker: .mee, mood: .guide, action: .doEasiestMission)
        case .level100: Persona(speaker: .duo, mood: .proud, action: .prestigeOrStay)
        }
    }

    /// Du plus important au moins important : ce qui change le rang ou éteint la
    /// Flamme passe avant.
    public static let momentPriority: [GuideMomentKey] = [
        .newRank, .level100, .firstMint, .flameOut, .flameAtRisk, .newTier, .treasuryTier,
        .badgeExtinguished, .priceRises, .firstMintPossible, .missionsUnlocked, .firstLevel,
        .returnAfterAbsence,
    ]

    public static func moment<Seen: Sequence>(for event: GuideEvent, seen: Seen) -> GuideMoment where Seen.Element == String {
        let voice = persona(of: event.key)
        let presentation: GuidePresentation = Set(seen).contains(event.key.rawValue) ? .short : .full
        return GuideMoment(key: event.key, speaker: voice.speaker, mood: voice.mood, event: event,
                           action: voice.action, presentation: presentation)
    }

    /// UNE carte par ouverture d'écran : parmi les événements du moment, le plus
    /// important, un moment encore inédit passant devant un moment déjà vu de
    /// priorité voisine (un moment vu n'est montré qu'en l'absence d'inédit).
    public static func chooseMoment<Seen: Sequence>(events: [GuideEvent], seen: Seen) -> GuideMoment? where Seen.Element == String {
        let seenSet = Set(seen)
        func rank(_ event: GuideEvent) -> Int {
            momentPriority.firstIndex(of: event.key) ?? -1
        }
        let byPriority = events.enumerated()
            .sorted { lhs, rhs in
                let (l, r) = (rank(lhs.element), rank(rhs.element))
                return l != r ? l < r : lhs.offset < rhs.offset
            }
            .map(\.element)
        guard let chosen = byPriority.first(where: { !seenSet.contains($0.key.rawValue) }) ?? byPriority.first else {
            return nil
        }
        return moment(for: chosen, seen: seenSet)
    }
}
