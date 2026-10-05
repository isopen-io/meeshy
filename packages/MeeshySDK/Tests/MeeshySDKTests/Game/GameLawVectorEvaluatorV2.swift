import Foundation
#if canImport(MeeshySDK)
import MeeshySDK
#endif

// MARK: - Le Jeu Meeshy rejoué sur les vecteurs partagés — la VAGUE 2 (#9384 à #9392)
//
// Les cas de la vague 2 sont AJOUTÉS après ceux de la vague 1 dans
// `game.vectors.json` ; ce fichier est le pendant Swift de
// `packages/shared/__tests__/game/game-vectors-law-v2.ts` (`evaluateGameVectorV2`).
// Chaque loi rend, dans la MÊME forme JSON que la loi TypeScript, la sortie du
// résolveur RÉEL du SDK. Sur divergence, c'est le TypeScript qui a raison.

extension GameLawVectorEvaluator {

    /// Les quarante-quatre lois de la vague 2 — la liste que `GameLawVectorTests` exige.
    static let wave2Laws: [String] = [
        "league-week", "league-week-points", "league-access", "league-pseudonym", "league-pseudonym-draw",
        "league-pseudonym-check", "league-snapshot", "league-groups", "league-settle", "league-friends",
        "league-visibility", "duo-draw", "duo-progress", "duo-reward", "duo-invite", "duo-transition",
        "season-calendar", "season-at", "season-progress", "season-reward", "season-claim", "season-settlement",
        "season-stars", "season-seal", "trophy-key", "trophy-parse", "trophy-flame", "showcase-order",
        "showcase-view", "showcase-cap", "trophy-month", "atlas", "atlas-language", "prestige", "rarity",
        "rarity-display", "mythic", "badge-tier", "badge-served", "guide-v2", "guide-choose", "photo-moment",
        "trophy-visitor-key", "showcase-visitor",
    ]

    static func evaluateWave2(law: String, input: GameJSON) throws -> GameJSON {
        switch law {
        case "league-week": return leagueWeek(input)
        case "league-week-points": return leagueWeekPoints(input)
        case "league-access": return leagueAccess(input)
        case "league-pseudonym": return object(["valid": .bool(GameLeague.isValidPseudonym(string(input, "value")))])
        case "league-pseudonym-draw": return object(["pseudonym": .string(GameLeague.pseudonym(fromDraw: int(input, "draw")))])
        case "league-pseudonym-check": return leaguePseudonymCheck(input)
        case "league-snapshot": return object(["snapshotDay": .string(GameLeague.snapshotDay(at: moment(input)))])
        case "league-groups": return try leagueGroups(input)
        case "league-settle": return try leagueSettle(input)
        case "league-friends": return leagueFriends(input)
        case "league-visibility": return leagueVisibility(input)
        case "duo-draw": return duoDraw(input)
        case "duo-progress": return duoProgress(input)
        case "duo-reward": return duoReward(input)
        case "duo-invite": return duoInvite(input)
        case "duo-transition": return try duoTransition(input)
        case "season-calendar": return seasonCalendar(input)
        case "season-at": return seasonAt(input)
        case "season-progress": return seasonProgress(input)
        case "season-reward": return seasonReward(input)
        case "season-claim": return seasonClaim(input)
        case "season-settlement": return seasonSettlement(input)
        case "season-stars": return try seasonStars(input)
        case "season-seal": return seasonSeal(input)
        case "trophy-key": return try trophyKey(input)
        case "trophy-parse": return object(["spec": GameTrophies.parse(string(input, "key")).map(specJSON) ?? .null])
        case "trophy-flame": return trophyFlame(input)
        case "showcase-order": return showcaseOrder(input)
        case "showcase-view": return showcaseView(input)
        case "showcase-cap": return showcaseCap(input)
        case "trophy-month": return object(["month": .optionalString(GameTrophies.visitorAwardedMonth(string(input, "awardedAt")))])
        case "atlas": return try atlas(input)
        case "atlas-language": return atlasLanguage(input)
        case "prestige": return prestige(input)
        case "rarity": return rarity(input)
        case "rarity-display":
            return object(["displayable": .bool(GameRarity.isShareDisplayable(holders: int(input, "holders"), population: int(input, "population")))])
        case "mythic": return mythic(input)
        case "badge-tier": return badgeTier(input)
        case "badge-served":
            let served = GameBadgeTiers.servedThresholds(knowsExtendedTiers: input["knowsExtendedTiers"].boolValue ?? false)
            return object(["thresholds": .array(served.map(GameJSON.int))])
        case "guide-v2": return try guideV2(input)
        case "guide-choose": return try guideChoose(input)
        case "photo-moment": return try photoMoment(input)
        case "trophy-visitor-key":
            return object(["key": .optionalString(GameTrophies.visitorKey(key: string(input, "key"), awardedMonth: string(input, "awardedMonth")))])
        case "showcase-visitor": return showcaseVisitor(input)
        default: throw GameLawVectorError.unknownLaw(law)
        }
    }

    // MARK: Aides

    private static func moment(_ json: GameJSON) -> LeagueMoment {
        LeagueMoment(dayKey: string(json, "dayKey"), minuteOfDay: int(json, "minuteOfDay"))
    }

    private static func momentJSON(_ moment: LeagueMoment) -> GameJSON {
        object(["dayKey": .string(moment.dayKey), "minuteOfDay": .int(moment.minuteOfDay)])
    }

    private static func league(_ json: GameJSON, _ key: String) throws -> LeagueKey {
        guard let value = LeagueKey(rawValue: string(json, key)) else { throw GameLawVectorError.malformed("ligue « \(key) »") }
        return value
    }

    private static func strings(_ json: GameJSON) -> [String] {
        json.arrayValue.compactMap(\.stringValue)
    }

    private static func memberPoints(_ json: GameJSON) -> [LeagueMemberPoints] {
        json.arrayValue.map { LeagueMemberPoints(userId: string($0, "userId"), weekPoints: int($0, "weekPoints")) }
    }

    private static func round6(_ value: Double) -> Double {
        (value * 1e6).rounded() / 1e6
    }

    // MARK: Ligue

    private static func leagueWeek(_ input: GameJSON) -> GameJSON {
        let at = moment(input)
        let week = GameLeague.weekKey(of: at.dayKey)
        return object([
            "weekday": .int(GameLeague.weekdayIndex(of: at.dayKey)),
            "weekKey": .string(week),
            "weekOfMoment": .string(GameLeague.weekOfMoment(at)),
            "close": momentJSON(GameLeague.weekClose(of: week)),
            "closed": .bool(GameLeague.isWeekClosed(weekKey: week, at: at)),
        ])
    }

    private static func leagueWeekPoints(_ input: GameJSON) -> GameJSON {
        let gains = input["gains"].arrayValue.map { LeagueGain(moment: moment($0), points: int($0, "points")) }
        return object(["points": .int(GameLeague.weekPoints(weekKey: string(input, "weekKey"), gains: gains))])
    }

    private static func leagueAccess(_ input: GameJSON) -> GameJSON {
        let access = GameLeague.access(
            levelRecord: int(input, "levelRecord"),
            adultVerified: input["adultVerified"].boolValue ?? false,
            consented: input["consented"].boolValue ?? false)
        return object(["status": .string(access.rawValue)])
    }

    private static func leaguePseudonymCheck(_ input: GameJSON) -> GameJSON {
        switch GameLeague.checkPseudonym(string(input, "value"), forbidden: strings(input["forbidden"])) {
        case .ok: object(["ok": .bool(true)])
        case .refused(let reason): object(["ok": .bool(false), "reason": .string(reason.rawValue)])
        }
    }

    private static func leagueGroups(_ input: GameJSON) throws -> GameJSON {
        let entrants = input["entrants"].arrayValue.map { LeagueEntrant(userId: string($0, "userId"), activity: int($0, "activity")) }
        let groups = GameLeague.partition(weekKey: string(input, "weekKey"), league: try league(input, "league"), entrants: entrants)
        return object(["groups": .array(groups.map { group in
            object([
                "groupId": .string(group.groupId),
                "size": .int(group.memberIds.count),
                "first": .optionalString(group.memberIds.first),
                "last": .optionalString(group.memberIds.last),
                "digest": .number(Double(GameSeed.fnv1a(group.memberIds.joined(separator: ",")))),
            ])
        })])
    }

    private static func standingJSON(_ settled: SettledLeagueMember) -> GameJSON {
        object([
            "userId": .string(settled.standing.userId),
            "weekPoints": .int(settled.standing.weekPoints),
            "rank": .int(settled.standing.rank),
            "zone": .string(settled.standing.zone.rawValue),
            "cup": .optionalString(settled.standing.cup?.rawValue),
            "outcome": object([
                "nextLeague": .string(settled.outcome.nextLeague.rawValue),
                "promoted": .bool(settled.outcome.promoted),
                "relegated": .bool(settled.outcome.relegated),
                "glory": .int(settled.outcome.glory),
            ]),
        ])
    }

    private static func leagueSettle(_ input: GameJSON) throws -> GameJSON {
        let league = try league(input, "league")
        let settled = GameLeague.settle(groupId: string(input, "groupId"), league: league, members: memberPoints(input["members"]))
        let userId = string(input, "userId")
        return object([
            "order": .array(settled.map { .string($0.standing.userId) }),
            "me": settled.first { $0.standing.userId == userId }.map(standingJSON) ?? .null,
            "promoted": .array(settled.filter(\.outcome.promoted).map { .string($0.standing.userId) }),
            "relegated": .array(settled.filter(\.outcome.relegated).map { .string($0.standing.userId) }),
            "cups": .array(settled.compactMap { member in
                member.standing.cup.map { .array([.string(member.standing.userId), .string($0.rawValue)]) }
            }),
            "gloryTotal": .int(settled.reduce(0) { $0 + $1.outcome.glory }),
            "pointsToPromotion": .optionalInt(GameLeague.pointsToPromotion(
                league: league, standings: settled.map(\.standing), userId: userId)),
        ])
    }

    private static func leagueFriends(_ input: GameJSON) -> GameJSON {
        var points: [String: Int] = [:]
        if case .object(let fields) = input["weekPoints"] {
            for (key, value) in fields { points[key] = value.intValue ?? 0 }
        }
        let entries = GameLeague.friendsRanking(
            weekKey: string(input, "weekKey"), viewerId: string(input, "viewerId"),
            friendIds: strings(input["friendIds"]), weekPoints: points)
        return object(["entries": .array(entries.map {
            object(["userId": .string($0.userId), "weekPoints": .int($0.weekPoints), "rank": .int($0.rank), "isMe": .bool($0.isMe)])
        })])
    }

    private static func leagueVisibility(_ input: GameJSON) -> GameJSON {
        let board = GameLeague.Board(rawValue: string(input, "board")) ?? .friends
        let visibility = GameLeague.visibility(board: board, viewerIsMember: input["viewerIsMember"].boolValue ?? false)
        return object([
            "pseudonym": .bool(visibility.pseudonym),
            "realIdentity": .bool(visibility.realIdentity),
            "presence": .bool(visibility.presence),
        ])
    }

    // MARK: Duo

    private static func duoDraw(_ input: GameJSON) -> GameJSON {
        let mission = GameDuo.draw(
            userA: string(input, "userA"), userB: string(input, "userB"), weekKey: string(input, "weekKey"),
            levelA: int(input, "levelA"), levelB: int(input, "levelB"),
            unavailableSignals: strings(input["unavailableSignals"]).map { MissionSignal($0) })
        return object(["mission": mission.map { mission in
            object([
                "weekKey": .string(mission.weekKey),
                "templateKey": .string(mission.templateKey),
                "signal": .string(mission.signal.rawValue),
                "prism": .bool(mission.prism),
                "partTarget": .int(mission.partTarget),
                "commonTarget": .int(mission.commonTarget),
                "basePoints": .int(mission.basePoints),
            ])
        } ?? .null])
    }

    private static func duoProgress(_ input: GameJSON) -> GameJSON {
        let progress = GameDuo.progress(partTarget: int(input, "partTarget"), mine: int(input, "mine"), partner: int(input, "partner"))
        return object([
            "mine": .int(progress.mine), "partner": .int(progress.partner), "common": .int(progress.common),
            "commonTarget": .int(progress.commonTarget), "mineDone": .bool(progress.mineDone),
            "partnerDone": .bool(progress.partnerDone), "bothDone": .bool(progress.bothDone),
        ])
    }

    private static func duoReward(_ input: GameJSON) -> GameJSON {
        let reward = GameDuo.reward(
            level: int(input, "level"), flameDays: int(input, "flameDays"),
            mineDone: input["mineDone"].boolValue ?? false, partnerDone: input["partnerDone"].boolValue ?? false)
        return object(["points": .int(reward.points), "doubled": .bool(reward.doubled)])
    }

    private static func duoInvite(_ input: GameJSON) -> GameJSON {
        let decision = GameDuo.canInvite(
            inviterLevelRecord: int(input, "inviterLevelRecord"), inviteeLevelRecord: int(input, "inviteeLevelRecord"),
            areFriends: input["areFriends"].boolValue ?? false, inviterHasDuo: input["inviterHasDuo"].boolValue ?? false,
            inviteeHasDuo: input["inviteeHasDuo"].boolValue ?? false, isSelf: input["self"].boolValue ?? false)
        switch decision {
        case .allowed: return object(["allowed": .bool(true)])
        case .refused(let reason): return object(["allowed": .bool(false), "reason": .string(reason.rawValue)])
        }
    }

    private static func duoTransition(_ input: GameJSON) throws -> GameJSON {
        guard let status = DuoStatus(rawValue: string(input, "status")),
              let action = DuoAction(rawValue: string(input, "action")),
              let actor = DuoActor(rawValue: string(input, "actor")) else { throw GameLawVectorError.malformed("duo-transition") }
        return object(["next": .optionalString(GameDuo.transition(status: status, action: action, actor: actor)?.rawValue)])
    }

    // MARK: Saison

    private static func rewardJSON(_ reward: SeasonReward?) -> GameJSON {
        reward.map { object(["kind": .string($0.kind.rawValue), "amount": .int($0.amount)]) } ?? .null
    }

    private static func sealJSON(_ seal: SeasonSeal?) -> GameJSON {
        seal.map { object(["cosmeticKey": .string($0.cosmeticKey)]) } ?? .null
    }

    private static func seasonCalendar(_ input: GameJSON) -> GameJSON {
        object(["calendar": GameSeason.calendar(number: int(input, "season")).map { calendar in
            object([
                "number": .int(calendar.number),
                "startDay": .string(calendar.startDay),
                "endDay": .string(calendar.endDay),
                "weekKeys": .array(calendar.weekKeys.map(GameJSON.string)),
                "themeKey": .string(calendar.themeKey),
            ])
        } ?? .null])
    }

    private static func seasonAt(_ input: GameJSON) -> GameJSON {
        let at = moment(input)
        return object([
            "season": .optionalInt(GameSeason.season(at: at.dayKey)),
            "week": .optionalInt(GameSeason.week(at: at.dayKey)),
            "seasonOfMoment": .optionalInt(GameSeason.season(of: at)),
        ])
    }

    private static func seasonProgress(_ input: GameJSON) -> GameJSON {
        let progress = GameSeason.progress(stars: int(input, "stars"))
        return object([
            "stars": .int(progress.stars), "steps": .int(progress.steps), "starsToNext": .int(progress.starsToNext),
            "progress": .number(round6(progress.progress)), "completed": .bool(progress.completed),
        ])
    }

    private static func seasonReward(_ input: GameJSON) -> GameJSON {
        object([
            "reward": rewardJSON(GameSeason.stepReward(int(input, "step"))),
            "seal": sealJSON(GameSeason.sealReward(season: int(input, "season"), step: int(input, "step"))),
        ])
    }

    private static func seasonClaim(_ input: GameJSON) -> GameJSON {
        let claim = GameSeason.claim(
            season: int(input, "season"), step: int(input, "step"), stepsReached: int(input, "stepsReached"),
            claimed: input["claimed"].arrayValue.compactMap(\.intValue), sealOwned: input["sealOwned"].boolValue ?? false)
        switch claim {
        case .allowed(let reward, let seal):
            return object(["allowed": .bool(true), "reward": rewardJSON(reward), "seal": sealJSON(seal)])
        case .refused(let reason):
            return object(["allowed": .bool(false), "reason": .string(reason.rawValue)])
        }
    }

    private static func seasonSettlement(_ input: GameJSON) -> GameJSON {
        let settlement = GameSeason.settlement(season: int(input, "season"), stepsReached: int(input, "stepsReached"))
        return object([
            "completed": .bool(settlement.completed), "glory": .int(settlement.glory),
            "cup": .bool(settlement.cup), "badgeKey": .optionalString(settlement.badgeKey),
        ])
    }

    private static func seasonStars(_ input: GameJSON) throws -> GameJSON {
        guard let source = SeasonStarSource(rawValue: string(input, "source")) else { throw GameLawVectorError.malformed("source d'étoiles") }
        return object(["stars": .int(GameSeason.stars(for: source))])
    }

    private static func seasonSeal(_ input: GameJSON) -> GameJSON {
        let refusal = GameSeason.sealRefusal(balance: int(input, "balance"), owned: input["owned"].boolValue ?? false)
        return refusal.map { object(["allowed": .bool(false), "reason": .string($0.rawValue)]) } ?? object(["allowed": .bool(true)])
    }

    // MARK: Trophées

    private static func specJSON(_ spec: TrophySpec) -> GameJSON {
        switch spec {
        case .leagueCup(let period, let league, let cup):
            let periodField: [String: GameJSON]
            switch period {
            case .week(let value): periodField = ["weekKey": .string(value)]
            case .month(let value): periodField = ["monthKey": .string(value)]
            }
            return object(periodField.merging([
                "kind": .string(spec.kind.rawValue), "league": .string(league.rawValue), "cup": .string(cup.rawValue),
            ]) { first, _ in first })
        case .seasonCup(let season): return object(["kind": .string(spec.kind.rawValue), "season": .int(season)])
        case .prestige(let number): return object(["kind": .string(spec.kind.rawValue), "number": .int(number)])
        case .flame(let days): return object(["kind": .string(spec.kind.rawValue), "days": .int(days)])
        }
    }

    private static func spec(_ json: GameJSON) throws -> TrophySpec {
        switch string(json, "kind") {
        case "league-cup":
            guard let cup = LeagueCup(rawValue: string(json, "cup")) else { throw GameLawVectorError.malformed("coupe") }
            let leagueKey = try league(json, "league")
            if let week = optionalString(json, "weekKey") { return .leagueCup(period: .week(week), league: leagueKey, cup: cup) }
            return .leagueCup(period: .month(string(json, "monthKey")), league: leagueKey, cup: cup)
        case "season-cup": return .seasonCup(season: int(json, "season"))
        case "prestige": return .prestige(number: int(json, "number"))
        case "flame": return .flame(days: int(json, "days"))
        case let other: throw GameLawVectorError.malformed("trophée « \(other) »")
        }
    }

    private static func trophyKey(_ input: GameJSON) throws -> GameJSON {
        object(["key": .string(GameTrophies.key(of: try spec(input["spec"])))])
    }

    private static func trophyFlame(_ input: GameJSON) -> GameJSON {
        let days = GameTrophies.flameTrophiesEarned(previousLongest: int(input, "previousLongest"), longest: int(input, "longest"))
        return object(["days": .array(days.map(GameJSON.int))])
    }

    private static func records(_ json: GameJSON) -> [TrophyRecord] {
        json.arrayValue.map { TrophyRecord(key: string($0, "key"), awardedAt: string($0, "awardedAt")) }
    }

    private static func showcaseOrder(_ input: GameJSON) -> GameJSON {
        let order = GameTrophies.orderShowcase(owned: records(input["owned"]), order: strings(input["order"]))
        return object(["order": .array(order.map(GameJSON.string))])
    }

    private static func showcaseView(_ input: GameJSON) -> GameJSON {
        let viewer = ShowcaseViewer(rawValue: string(input, "viewer")) ?? .other
        return object(["visible": .bool(GameTrophies.canView(visibility: string(input, "visibility"), viewer: viewer))])
    }

    private static func showcaseCap(_ input: GameJSON) -> GameJSON {
        let capped = GameTrophies.capVisibility(
            string(input, "visibility"), hideProfileFromSearch: input["hideProfileFromSearch"].boolValue ?? false,
            gameHidden: input["gameHidden"].boolValue ?? false)
        return object(["visibility": .string(capped.rawValue)])
    }

    private static func showcaseVisitor(_ input: GameJSON) -> GameJSON {
        let showcase = GameTrophies.visitorShowcase(owned: records(input["owned"]), order: strings(input["order"]))
        return object([
            "items": .array(showcase.items.map { item in
                var fields: [String: GameJSON] = ["key": .string(item.key), "awardedMonth": .string(item.awardedMonth)]
                if let count = item.count { fields["count"] = .int(count) }
                return object(fields)
            }),
            "order": .array(showcase.order.map(GameJSON.string)),
        ])
    }

    // MARK: Atlas, Prestige, rareté, badges

    private static func atlas(_ input: GameJSON) throws -> GameJSON {
        let events = try input["events"].arrayValue.map { event -> AtlasEvent in
            guard let kind = AtlasEvent.Kind(rawValue: string(event, "kind")) else { throw GameLawVectorError.malformed("événement d'Atlas") }
            return AtlasEvent(kind: kind, language: string(event, "language"), dayKey: string(event, "dayKey"))
        }
        let state = GameAtlas.fold(events)
        let summary = GameAtlas.summary(of: state)
        return object([
            "stamped": .int(summary.stamped),
            "total": .int(summary.total),
            "remaining": .int(summary.remaining),
            "stamps": .array(summary.stamps.map { object(["language": .string($0.language), "stampedOn": .string($0.stampedOn)]) }),
            "pending": .array(summary.pending.map {
                object(["language": .string($0.language), "sent": .bool($0.sent), "received": .bool($0.received)])
            }),
            "entries": .array(state.sorted { GameOrdering.compare($0.key, $1.key) < 0 }.map { language, entry in
                object([
                    "language": .string(language), "sent": .bool(entry.sent), "received": .bool(entry.received),
                    "stampedOn": .optionalString(entry.stampedOn),
                ])
            }),
        ])
    }

    private static func atlasLanguage(_ input: GameJSON) -> GameJSON {
        object(["language": .optionalString(GameAtlas.language(of: input["code"].stringValue)), "total": .int(GameAtlas.total)])
    }

    private static func prestige(_ input: GameJSON) -> GameJSON {
        switch GamePrestige.transition(score: int(input, "score"), prestige: int(input, "prestige")) {
        case .allowed(let passage):
            return object([
                "allowed": .bool(true), "prestigeAfter": .int(passage.prestigeAfter), "scoreAfter": .int(passage.scoreAfter),
                "levelAfter": .int(passage.levelAfter), "levelRecordAfter": .int(passage.levelRecordAfter),
                "gloryGained": .int(passage.gloryGained), "trophyKey": .string(passage.trophyKey),
            ])
        case .refused(let reason):
            return object(["allowed": .bool(false), "reason": .string(reason.rawValue)])
        }
    }

    private static func rarity(_ input: GameJSON) -> GameJSON {
        let holders = int(input, "holders")
        let population = int(input, "population")
        let measured = GameRarity.measure(holders: holders, population: population)
        return object([
            "rarity": .string(GameRarity.rarity(holders: holders, population: population).rawValue),
            "measured": .optionalString(measured?.rawValue),
            "border": .optionalString(measured.map { GameRarity.border(for: $0).rawValue }),
            "glory": .int(GameRarity.gloryAtEarning(measured)),
        ])
    }

    private static func mythic(_ input: GameJSON) -> GameJSON {
        let candidates = input["candidates"].arrayValue.map { (userId: string($0, "userId"), glory: int($0, "glory")) }
        return object(["ids": .array(GameRarity.mythicUserIds(candidates).map(GameJSON.string))])
    }

    private static func badgeTier(_ input: GameJSON) -> GameJSON {
        let imprint = GameBadgeTiers.imprint(count: int(input, "count"), threshold: int(input, "threshold"))
        return object([
            "materialOfThreshold": .optionalString(GameBadgeTiers.material(ofThreshold: int(input, "threshold"))?.rawValue),
            "materialReached": .optionalString(GameBadgeTiers.materialReached(count: int(input, "count"))?.rawValue),
            "imprint": object(["extinguished": .bool(imprint.extinguished), "missing": .int(imprint.missing)]),
        ])
    }

    // MARK: Guide et moments photo

    private static let wave2GuideKinds = Set(GuideMomentKeyV2.allCases.map(\.rawValue))

    private static func guideEventV2(_ json: GameJSON) throws -> GuideEventV2 {
        switch string(json, "kind") {
        case "league-first":
            return .leagueFirst(league: try league(json, "league"), pointsToPromotion: optionalInt(json, "pointsToPromotion"))
        case "league-promoted":
            return .leaguePromoted(from: try league(json, "from"), to: try league(json, "to"),
                                   rank: int(json, "rank"), weekKey: string(json, "weekKey"))
        case "league-relegated":
            return .leagueRelegated(from: try league(json, "from"), to: try league(json, "to"),
                                    pointsToPromotion: optionalInt(json, "pointsToPromotion"), weekKey: string(json, "weekKey"))
        case "season-start":
            return .seasonStart(season: int(json, "season"), themeKey: string(json, "themeKey"), steps: int(json, "steps"))
        case "season-end":
            return .seasonEnd(season: int(json, "season"), stepsReached: int(json, "stepsReached"),
                              completed: json["completed"].boolValue ?? false, gloryGained: int(json, "gloryGained"))
        case "trophy": return .trophy(trophyKey: string(json, "trophyKey"))
        case "prestige": return .prestige(prestige: int(json, "prestige"), gloryGained: int(json, "gloryGained"))
        case "atlas-stamp":
            return .atlasStamp(language: string(json, "language"), stamped: int(json, "stamped"), total: int(json, "total"))
        case let other: throw GameLawVectorError.malformed("événement de guide « \(other) »")
        }
    }

    private static func guideDataV2(_ event: GuideEventV2) -> GameJSON {
        switch event {
        case .leagueFirst(let league, let points):
            object(["league": .string(league.rawValue), "pointsToPromotion": .optionalInt(points)])
        case .leaguePromoted(let from, let to, let rank, let weekKey):
            object(["from": .string(from.rawValue), "to": .string(to.rawValue), "rank": .int(rank), "weekKey": .string(weekKey)])
        case .leagueRelegated(let from, let to, let points, let weekKey):
            object(["from": .string(from.rawValue), "to": .string(to.rawValue),
                    "pointsToPromotion": .optionalInt(points), "weekKey": .string(weekKey)])
        case .seasonStart(let season, let themeKey, let steps):
            object(["season": .int(season), "themeKey": .string(themeKey), "steps": .int(steps)])
        case .seasonEnd(let season, let stepsReached, let completed, let glory):
            object(["season": .int(season), "stepsReached": .int(stepsReached), "completed": .bool(completed),
                    "gloryGained": .int(glory)])
        case .trophy(let trophyKey): object(["trophyKey": .string(trophyKey)])
        case .prestige(let prestige, let glory): object(["prestige": .int(prestige), "gloryGained": .int(glory)])
        case .atlasStamp(let language, let stamped, let total):
            object(["language": .string(language), "stamped": .int(stamped), "total": .int(total)])
        }
    }

    private static func guideV2(_ input: GameJSON) throws -> GameJSON {
        let moment = GameGuideV2.moment(for: try guideEventV2(input["event"]), seen: strings(input["seen"]))
        return object([
            "key": .string(moment.key.rawValue),
            "speaker": .string(moment.speaker.rawValue),
            "mood": .string(moment.mood.rawValue),
            "action": .string(moment.action.rawValue),
            "data": guideDataV2(moment.event),
            "presentation": .string(moment.presentation.rawValue),
        ])
    }

    private static func guideChoose(_ input: GameJSON) throws -> GameJSON {
        let events = try input["events"].arrayValue.map { event -> GuideAnyEvent in
            wave2GuideKinds.contains(string(event, "kind"))
                ? .wave2(try guideEventV2(event))
                : .original(try guideEvent(event))
        }
        let chosen = GameGuideV2.chooseMoment(events: events, seen: strings(input["seen"]))
        return object([
            "key": .optionalString(chosen?.keyValue),
            "presentation": .optionalString(chosen?.presentation.rawValue),
        ])
    }

    private static func photoMoment(_ input: GameJSON) throws -> GameJSON {
        guard let emblem = GamePhotoMomentsV2.emblem(of: try guideEventV2(input["event"])) else {
            return object(["emblem": .null, "id": .null])
        }
        let json: GameJSON
        switch emblem {
        case .trophy(let key): json = object(["kind": .string("trophy"), "trophyKey": .string(key)])
        case .leagueUp(let league, let weekKey):
            json = object(["kind": .string("league-up"), "league": .string(league.rawValue), "weekKey": .string(weekKey)])
        case .season(let season): json = object(["kind": .string("season"), "season": .int(season)])
        case .prestige(let number): json = object(["kind": .string("prestige"), "number": .int(number)])
        }
        return object(["emblem": json, "id": .string(emblem.id)])
    }
}
