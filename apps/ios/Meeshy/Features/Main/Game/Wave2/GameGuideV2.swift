import Foundation
import MeeshySDK

// MARK: - Les événements du guide, vague 2 (#9481)
//
// La loi partagée (`GameGuideV2.chooseMoment`) choisit LE moment ; ce fichier relève ses huit événements dans l'état
// du jeu, comme `GameGuideEvents` le fait pour la vague 1. Miroir de `apps/web/src/lib/game-guide/events-v2.ts` :
//
//  - `standing` lit l'ÉTAT à l'ouverture. Seules deux découvertes s'y lisent — la première ligue, le début d'une
//    saison — et chacune ne se dit qu'UNE fois (tant que sa clé n'est pas vue) ;
//  - `between` compare deux INSTANTANÉS : ce qui vient d'ARRIVER (une montée, une descente, un trophée, un tampon,
//    un Prestige) se dit chaque fois, version complète la première fois, courte ensuite — la loi en décide.
//
// L'INSTANTANÉ est la plus petite chose qui permet de comparer. Il se garde sur l'appareil entre deux ouvertures :
// une montée de ligue arrive le dimanche soir, et c'est à l'ouverture SUIVANTE qu'on la raconte. Rien n'est inventé :
// une extension absente d'UNE des deux lectures (un ancien serveur, ou un bloc qui vient d'apparaître) ne produit
// aucune transition — on ne célèbre pas ce qu'on n'a pas vu changer.

struct GuideSnapshotV2: Codable, Equatable {
    struct League: Codable, Equatable {
        struct Current: Codable, Equatable {
            let league: LeagueKey
            let rank: Int
            let pointsToPromotion: Int?
        }

        let weekKey: String
        let current: Current?
    }

    struct Season: Codable, Equatable {
        let number: Int
        let themeKey: String
        let steps: Int
        let completed: Bool
    }

    struct Atlas: Codable, Equatable {
        let total: Int
        let languages: [String]
    }

    let prestige: Int
    let league: League?
    let season: Season?
    let trophies: [String]?
    let atlas: Atlas?

    init(prestige: Int, league: League?, season: Season?, trophies: [String]?, atlas: Atlas?) {
        self.prestige = prestige
        self.league = league
        self.season = season
        self.trophies = trophies
        self.atlas = atlas
    }

    init(game: GameBlock) {
        prestige = game.level.prestige
        league = game.league.map { block in
            League(weekKey: block.weekKey, current: block.current.map {
                League.Current(league: $0.league, rank: $0.rank, pointsToPromotion: $0.pointsToPromotion)
            })
        }
        season = game.season.map { Season(number: $0.number, themeKey: $0.themeKey, steps: $0.steps, completed: $0.completed) }
        trophies = game.trophies.map { $0.items.map(\.key) }
        atlas = game.atlas.map { Atlas(total: $0.total, languages: $0.stamps.map(\.language)) }
    }
}

enum GameGuideEventsV2 {

    private static func seasonStart(_ season: GuideSnapshotV2.Season) -> GuideEventV2 {
        .seasonStart(season: season.number, themeKey: season.themeKey, steps: GameSeason.steps)
    }

    /// Ce que l'état dit à l'ouverture, et que la personne n'a pas encore entendu.
    static func standing(game: GameBlock, seen: Set<String>) -> [GuideEventV2] {
        var events: [GuideEventV2] = []
        if let league = game.league, league.access == .open, let current = league.current {
            events.append(.leagueFirst(league: current.league, pointsToPromotion: current.pointsToPromotion))
        }
        if let season = GuideSnapshotV2(game: game).season { events.append(seasonStart(season)) }
        return events.filter { !seen.contains($0.key.rawValue) }
    }

    /// Ce qui est arrivé entre deux instantanés. Une extension absente d'un des deux côtés ne produit rien.
    static func between(before: GuideSnapshotV2, after: GuideSnapshotV2) -> [GuideEventV2] {
        var events: [GuideEventV2] = []

        if let was = before.league, let now = after.league {
            if was.current == nil, let current = now.current {
                events.append(.leagueFirst(league: current.league, pointsToPromotion: current.pointsToPromotion))
            } else if let from = was.current, let to = now.current, now.weekKey != was.weekKey {
                if to.league.index > from.league.index {
                    events.append(.leaguePromoted(from: from.league, to: to.league, rank: from.rank, weekKey: was.weekKey))
                } else if to.league.index < from.league.index {
                    events.append(.leagueRelegated(from: from.league, to: to.league, pointsToPromotion: to.pointsToPromotion, weekKey: was.weekKey))
                }
            }
        }

        // Pas de saison des deux côtés : un serveur qui ne la sert pas, ou aucune saison ouverte — rien à dire.
        if let finished = before.season, after.season?.number != finished.number {
            events.append(.seasonEnd(
                season: finished.number, stepsReached: finished.steps, completed: finished.completed,
                gloryGained: finished.completed ? GameGlory.points.season : 0))
        }
        if let started = after.season, before.season?.number != started.number {
            events.append(seasonStart(started))
        }

        if let was = before.trophies, let now = after.trophies {
            let known = Set(was)
            events.append(contentsOf: now.filter { !known.contains($0) }.map { GuideEventV2.trophy(trophyKey: $0) })
        }

        if after.prestige > before.prestige {
            events.append(.prestige(prestige: after.prestige, gloryGained: GameGlory.points.prestige))
        }

        if let was = before.atlas, let now = after.atlas {
            let known = Set(was.languages)
            for language in now.languages where !known.contains(language) {
                events.append(.atlasStamp(language: language, stamped: now.languages.count, total: now.total))
            }
        }
        return events
    }

    /// Les événements d'une transition entre deux lectures du bloc.
    static func transition(from before: GameBlock, to after: GameBlock) -> [GuideEventV2] {
        between(before: GuideSnapshotV2(game: before), after: GuideSnapshotV2(game: after))
    }
}

// MARK: - La mémoire de l'instantané entre deux ouvertures

/// Ce que l'appareil garde du dernier instantané lu, par COMPTE : sans lui, une montée de ligue arrivée pendant que
/// l'app était fermée ne se raconterait jamais. Une commodité par appareil — rien d'autre n'y vit.
protocol GuideSnapshotStoring: AnyObject {
    func load() -> GuideSnapshotV2?
    func save(_ snapshot: GuideSnapshotV2)
}

final class UserDefaultsGuideSnapshotStore: GuideSnapshotStoring {
    nonisolated deinit {}
    private let defaults: UserDefaults
    private let key: String

    init(userId: String, defaults: UserDefaults = .standard) {
        self.defaults = defaults
        self.key = "meeshy.game.guide-snapshot.\(userId)"
    }

    func load() -> GuideSnapshotV2? {
        defaults.data(forKey: key).flatMap { try? JSONDecoder().decode(GuideSnapshotV2.self, from: $0) }
    }

    func save(_ snapshot: GuideSnapshotV2) {
        guard let data = try? JSONEncoder().encode(snapshot) else { return }
        defaults.set(data, forKey: key)
    }
}

// MARK: - Ce que disent Mee et Meo, vague 2

extension GameGuideCopy {

    static func actionLabelV2(_ action: GuideActionV2) -> String {
        switch action {
        case .seeLeague: GameText.guideActionSeeLeague
        case .seeSeason: GameText.guideActionSeeSeason
        case .seeTrophies: GameText.guideActionSeeTrophies
        case .seeAtlas: GameText.guideActionSeeAtlas
        case .seeLevel: actionLabel(.seeLevel)
        }
    }

    /// Les huit moments : ce qui vient d'arriver → ce que ça veut dire → l'étape d'après → un bouton, avec une
    /// version COURTE pour les fois suivantes. La loi choisit le moment et rend ses chiffres ; elle ne prononce rien.
    static func momentV2(_ moment: GuideMomentV2) -> GuideCopy {
        let action = actionLabelV2(moment.action)
        let number = GameCopy.formatCount
        func copy(_ what: String, _ means: String, _ next: String, _ short: String) -> GuideCopy {
            GuideCopy(what: what, means: means, next: next, short: short, action: action)
        }
        switch moment.event {
        case .leagueFirst(let league, let points):
            let name = GameText.leagueName(league)
            return copy(
                GameText.guideMomentLeagueFirstWhat(league: name),
                GameText.guideMomentLeagueFirstMeans,
                points.map { GameText.guideMomentLeagueFirstNext(points: GameCopy.points($0)) } ?? GameText.guideMomentLeagueFirstNextTop,
                points.map { GameText.guideMomentLeagueFirstShort(league: name, points: GameCopy.points($0)) } ?? GameText.leagueAtTop
            )
        case .leaguePromoted(let from, let to, let rank, _):
            return copy(
                GameText.guideMomentLeaguePromotedWhat(league: GameText.leagueName(to)),
                GameText.guideMomentLeaguePromotedMeans(rank: number(rank), from: GameText.leagueName(from)),
                GameText.guideMomentLeaguePromotedNext,
                GameText.guideMomentLeaguePromotedShort(league: GameText.leagueName(to))
            )
        case .leagueRelegated(_, let to, let points, _):
            let name = GameText.leagueName(to)
            let near = (points ?? 0) > 0
            return copy(
                GameText.guideMomentLeagueRelegatedWhat(league: name),
                GameText.guideMomentLeagueRelegatedMeans,
                near ? GameText.guideMomentLeagueRelegatedNext(points: GameCopy.points(points ?? 0)) : GameText.guideMomentLeagueRelegatedNextFar,
                GameText.guideMomentLeagueRelegatedShort(league: name)
            )
        case .seasonStart(let season, let themeKey, let steps):
            let theme = GameWave2Format.seasonTheme(themeKey)
            return copy(
                GameText.guideMomentSeasonStartWhat(season: number(season)),
                theme.map { GameText.guideMomentSeasonStartMeans(theme: $0) } ?? GameText.guideMomentSeasonStartMeansPlain,
                GameText.guideMomentSeasonStartNext(steps: number(steps)),
                GameText.guideMomentSeasonStartShort(season: number(season))
            )
        case .seasonEnd(let season, let stepsReached, let completed, let glory):
            return copy(
                completed ? GameText.guideMomentSeasonEndWhatDone(season: number(season)) : GameText.guideMomentSeasonEndWhat(season: number(season)),
                completed ? GameText.guideMomentSeasonEndMeansDone(glory: number(glory)) : GameText.guideMomentSeasonEndMeans(steps: number(stepsReached)),
                GameText.guideMomentSeasonEndNext,
                GameText.guideMomentSeasonEndShort(season: number(season))
            )
        case .trophy(let key):
            let title = GameTrophyPresentation.of(key: key)?.title ?? GameText.guideMomentTrophyWhat
            return copy(
                GameText.guideMomentTrophyWhat, GameText.guideMomentTrophyMeans(title: title),
                GameText.guideMomentTrophyNext, GameText.guideMomentTrophyShort(title: title)
            )
        case .prestige(let prestige, let glory):
            return copy(
                GameText.guideMomentPrestigeWhat(number: number(prestige)), GameText.guideMomentPrestigeMeans(glory: number(glory)),
                GameText.guideMomentPrestigeNext, GameText.guideMomentPrestigeShort(number: number(prestige))
            )
        case .atlasStamp(let language, let stamped, let total):
            let name = GameWave2Format.languageName(language)
            return copy(
                GameText.guideMomentAtlasStampWhat(language: name), GameText.guideMomentAtlasStampMeans,
                GameText.guideMomentAtlasStampNext(stamped: number(stamped), total: number(total)),
                GameText.guideMomentAtlasStampShort(language: name)
            )
        }
    }
}

// MARK: - Les moments photo, vague 2

extension GamePhotoMoments {

    /// Le moment photo d'un emblème de la vague 2 : un trophée, une montée de ligue, une saison terminée, un Prestige.
    /// L'identité vient de la loi (`PhotoMomentEmblemV2.id`) : un « plus tard » puis un retour ne propose jamais deux
    /// fois la même photo, et une montée vers la même ligue une autre semaine est un moment nouveau.
    static func ofEmblemV2(_ emblem: PhotoMomentEmblemV2) -> PhotoMoment {
        switch emblem {
        case .trophy(let key):
            let kicker = GameText.photoKickerTrophy
            return PhotoMoment(id: emblem.id, emblem: .trophy(key: key), kicker: kicker,
                               title: GameTrophyPresentation.of(key: key)?.title ?? kicker)
        case .leagueUp(let league, _):
            return PhotoMoment(id: emblem.id, emblem: .leagueUp(league), kicker: GameText.photoKickerLeagueUp,
                               title: GameText.photoTitleLeagueUp(league: GameText.leagueName(league)))
        case .season(let season):
            return PhotoMoment(id: emblem.id, emblem: .season(season), kicker: GameText.photoKickerSeason,
                               title: GameText.doorSeason(number: GameCopy.formatCount(season)))
        case .prestige(let number):
            return PhotoMoment(
                id: emblem.id, emblem: .prestige(number: number), kicker: GameText.photoKickerPrestige,
                title: String(localized: "game.photo.title.prestige", defaultValue: "Prestige \(GameCopy.formatCount(number))", bundle: .main))
        }
    }

    /// Les moments de la vague 2 qu'une transition vient de produire.
    static func ofTransitionV2(from before: GameBlock, to after: GameBlock) -> [PhotoMoment] {
        GameGuideEventsV2.transition(from: before, to: after)
            .compactMap(GamePhotoMomentsV2.emblem(of:))
            .map(ofEmblemV2)
    }
}
