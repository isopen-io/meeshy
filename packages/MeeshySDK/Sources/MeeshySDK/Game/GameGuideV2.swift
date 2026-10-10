import Foundation

// MARK: - Les moments de guide de la vague 2 (#9384 à #9389)
//
// MIROIR de `packages/shared/utils/game/guide-v2.ts` et `photo-moments.ts` —
// ligue, saison, trophée, Prestige, Atlas. Ce fichier PROLONGE `GameGuide` sans
// le toucher : `GuideEvent`, `GuideAction` et `GuideMomentKey` gardent leurs
// treize moments. Le choix d'UNE carte par ouverture d'écran se fait sur
// l'ensemble : `GameGuideV2.chooseMoment`.
//
// Comme la loi du premier lot, celle-ci ne dit rien en toutes lettres : une clé
// stable, un locuteur, une humeur, les chiffres du moment, l'étape d'après, et
// si le moment se montre en entier (la première fois) ou en version courte. La
// clé du moment est la clé « déjà vu » que le serveur garde (`game.guideSeen`).

/// Le bouton qui mène à l'étape d'après : les quatre nouveaux, et « voir le niveau » du Prestige.
public enum GuideActionV2: String, CaseIterable, Sendable, Hashable {
    case seeLeague = "see-league"
    case seeSeason = "see-season"
    case seeTrophies = "see-trophies"
    case seeAtlas = "see-atlas"
    case seeLevel = "see-level"
}

public enum GuideMomentKeyV2: String, CaseIterable, Codable, Sendable, Hashable {
    case leagueFirst = "league-first"
    case leaguePromoted = "league-promoted"
    case leagueRelegated = "league-relegated"
    case seasonStart = "season-start"
    case seasonEnd = "season-end"
    case trophy
    case prestige
    case atlasStamp = "atlas-stamp"
}

/// Ce qui vient d'arriver au joueur, avec les chiffres que le moment cite.
public enum GuideEventV2: Sendable, Equatable {
    case leagueFirst(league: LeagueKey, pointsToPromotion: Int?)
    case leaguePromoted(from: LeagueKey, to: LeagueKey, rank: Int, weekKey: String)
    case leagueRelegated(from: LeagueKey, to: LeagueKey, pointsToPromotion: Int?, weekKey: String)
    case seasonStart(season: Int, themeKey: String, steps: Int)
    case seasonEnd(season: Int, stepsReached: Int, completed: Bool, gloryGained: Int)
    case trophy(trophyKey: String)
    case prestige(prestige: Int, gloryGained: Int)
    case atlasStamp(language: String, stamped: Int, total: Int)

    public var key: GuideMomentKeyV2 {
        switch self {
        case .leagueFirst: .leagueFirst
        case .leaguePromoted: .leaguePromoted
        case .leagueRelegated: .leagueRelegated
        case .seasonStart: .seasonStart
        case .seasonEnd: .seasonEnd
        case .trophy: .trophy
        case .prestige: .prestige
        case .atlasStamp: .atlasStamp
        }
    }
}

public struct GuideMomentV2: Sendable, Equatable {
    public let key: GuideMomentKeyV2
    public let speaker: GuideSpeaker
    public let mood: GuideMood
    public let event: GuideEventV2
    public let action: GuideActionV2
    public let presentation: GuidePresentation

    public init(key: GuideMomentKeyV2, speaker: GuideSpeaker, mood: GuideMood, event: GuideEventV2,
                action: GuideActionV2, presentation: GuidePresentation) {
        self.key = key
        self.speaker = speaker
        self.mood = mood
        self.event = event
        self.action = action
        self.presentation = presentation
    }
}

/// Un événement de l'ensemble des vingt et un moments : les treize d'origine ou les huit nouveaux.
public enum GuideAnyEvent: Sendable, Equatable {
    case original(GuideEvent)
    case wave2(GuideEventV2)

    var keyValue: String {
        switch self {
        case .original(let event): event.key.rawValue
        case .wave2(let event): event.key.rawValue
        }
    }
}

/// Le moment choisi parmi les vingt et un.
public enum GuideAnyMoment: Sendable, Equatable {
    case original(GuideMoment)
    case wave2(GuideMomentV2)

    public var keyValue: String {
        switch self {
        case .original(let moment): moment.key.rawValue
        case .wave2(let moment): moment.key.rawValue
        }
    }

    public var presentation: GuidePresentation {
        switch self {
        case .original(let moment): moment.presentation
        case .wave2(let moment): moment.presentation
        }
    }
}

public enum GameGuideV2 {

    private struct Persona {
        let speaker: GuideSpeaker
        let mood: GuideMood
        let action: GuideActionV2
    }

    private static func persona(of event: GuideEventV2) -> Persona {
        switch event {
        case .leagueFirst: Persona(speaker: .mee, mood: .guide, action: .seeLeague)
        case .leaguePromoted: Persona(speaker: .mee, mood: .cheer, action: .seeLeague)
        case .leagueRelegated: Persona(speaker: .meo, mood: .calm, action: .seeLeague)
        case .seasonStart: Persona(speaker: .duo, mood: .cheer, action: .seeSeason)
        case .seasonEnd(_, _, let completed, _): Persona(speaker: .duo, mood: completed ? .proud : .calm, action: .seeSeason)
        case .trophy: Persona(speaker: .duo, mood: .proud, action: .seeTrophies)
        case .prestige: Persona(speaker: .duo, mood: .proud, action: .seeLevel)
        case .atlasStamp: Persona(speaker: .mee, mood: .cheer, action: .seeAtlas)
        }
    }

    public static func moment<Seen: Sequence>(for event: GuideEventV2, seen: Seen) -> GuideMomentV2 where Seen.Element == String {
        let voice = persona(of: event)
        let presentation: GuidePresentation = Set(seen).contains(event.key.rawValue) ? .short : .full
        return GuideMomentV2(key: event.key, speaker: voice.speaker, mood: voice.mood, event: event,
                             action: voice.action, presentation: presentation)
    }

    /// Du plus important au moins important, sur les vingt et un moments : ce qui
    /// change le rang, ce qui se reçoit pour toujours (Prestige, trophée) puis ce qui
    /// éteint ou protège passent avant.
    public static let momentPriorityAll: [String] = [
        "new-rank", "prestige", "trophy", "level-100", "first-mint", "season-end", "flame-out", "flame-at-risk",
        "league-promoted", "league-relegated", "new-tier", "season-start", "treasury-tier", "badge-extinguished",
        "price-rises", "atlas-stamp", "league-first", "first-mint-possible", "missions-unlocked", "first-level",
        "return-after-absence",
    ]

    /// UNE carte par ouverture d'écran, parmi les événements anciens ET nouveaux : le
    /// plus important, un moment encore inédit passant devant un moment déjà vu.
    /// Sans événement nouveau, c'est exactement `GameGuide.chooseMoment`.
    public static func chooseMoment<Seen: Sequence>(events: [GuideAnyEvent], seen: Seen) -> GuideAnyMoment?
        where Seen.Element == String {
        let seenSet = Set(seen)
        let originals: [GuideEvent] = events.compactMap { event in
            if case .original(let original) = event { return original }
            return nil
        }
        if originals.count == events.count {
            return GameGuide.chooseMoment(events: originals, seen: seenSet).map(GuideAnyMoment.original)
        }
        func rank(_ event: GuideAnyEvent) -> Int {
            momentPriorityAll.firstIndex(of: event.keyValue) ?? -1
        }
        let byPriority = GameOrdering.stableSorted(events) { lhs, rhs in
            let order = rank(lhs) - rank(rhs)
            return order == 0 ? 0 : (order < 0 ? -1 : 1)
        }
        guard let chosen = byPriority.first(where: { !seenSet.contains($0.keyValue) }) ?? byPriority.first else { return nil }
        switch chosen {
        case .original(let event): return .original(GameGuide.moment(for: event, seen: seenSet))
        case .wave2(let event): return .wave2(moment(for: event, seen: seenSet))
        }
    }
}

// MARK: - Les moments photo de la vague 2 (#9387, #9384, #9386, #9389)
//
// Au déclenchement, Mee et Meo « frappent en place » l'emblème du moment dans la
// photo. La loi dit QUEL emblème et QUELLE identité : l'identité fait qu'un
// « plus tard » puis un retour ne propose jamais deux fois la même photo, et
// qu'une montée vers la même ligue une autre semaine est un moment nouveau.
//
// Ne se photographient pas : une première ligue, une descente (Meo la dit
// calmement), une saison inachevée, un simple tampon d'Atlas.

public enum PhotoMomentEmblemV2: Sendable, Equatable {
    case trophy(trophyKey: String)
    case leagueUp(league: LeagueKey, weekKey: String)
    case season(season: Int)
    case prestige(number: Int)

    /// L'identité du moment : deux moments identiques ne se proposent qu'une fois.
    public var id: String {
        switch self {
        case .trophy(let trophyKey): "trophy:\(trophyKey)"
        case .leagueUp(let league, let weekKey): "league-up:\(weekKey):\(league.rawValue)"
        case .season(let season): "season:\(season)"
        case .prestige(let number): "prestige:\(number)"
        }
    }
}

public enum GamePhotoMomentsV2 {
    public static func emblem(of event: GuideEventV2) -> PhotoMomentEmblemV2? {
        switch event {
        case .trophy(let trophyKey): .trophy(trophyKey: trophyKey)
        case .leaguePromoted(_, let to, _, let weekKey): .leagueUp(league: to, weekKey: weekKey)
        case .seasonEnd(let season, _, let completed, _): completed ? .season(season: season) : nil
        case .prestige(let prestige, _): .prestige(number: prestige)
        case .leagueFirst, .leagueRelegated, .seasonStart, .atlasStamp: nil
        }
    }
}
