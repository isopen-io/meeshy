import Foundation

// MARK: - La mission en duo hebdomadaire (#9385)
//
// MIROIR de `packages/shared/utils/game/duo.ts`. À deux, avec un ami accepté :
// « objectif commun, récompense double si les deux finissent leur part ». Elle
// s'ouvre au niveau 20 (record) pour les deux. Le duo est un OBJET à deux
// (`invited` → `active` → `completed`, ou `abandoned` / `expired`) : un duo à la
// fois par personne.
//
// Le tirage est déterministe — graine = la PAIRE triée des deux comptes et la
// semaine —, donc identique pour les deux, quel que soit celui qui regarde. La
// part de chacun se mesure sur le niveau le plus BAS des deux : on ne punit pas
// l'ami qui débute. Le plafond de la part empêche l'excédent de l'un de finir
// la part de l'autre : « à deux » veut dire que les deux jouent.

public struct DuoTemplate: Sendable, Equatable {
    public let key: String
    public let signal: MissionSignal
    /// La part de CHACUN, avant la bande de niveau.
    public let basePartTarget: Int
    public let prism: Bool

    public init(key: String, signal: MissionSignal, basePartTarget: Int, prism: Bool) {
        self.key = key
        self.signal = signal
        self.basePartTarget = basePartTarget
        self.prism = prism
    }
}

public struct DuoMission: Sendable, Equatable {
    public let weekKey: String
    public let templateKey: String
    public let signal: MissionSignal
    public let prism: Bool
    /// Ce que CHACUN doit faire.
    public let partTarget: Int
    /// La barre commune : la somme des deux parts.
    public let commonTarget: Int
    public let basePoints: Int

    public init(weekKey: String, templateKey: String, signal: MissionSignal, prism: Bool,
                partTarget: Int, commonTarget: Int, basePoints: Int) {
        self.weekKey = weekKey
        self.templateKey = templateKey
        self.signal = signal
        self.prism = prism
        self.partTarget = partTarget
        self.commonTarget = commonTarget
        self.basePoints = basePoints
    }
}

public struct DuoProgress: Sendable, Equatable {
    /// Ma part, plafonnée à ce qu'on me demande.
    public let mine: Int
    public let partner: Int
    public let common: Int
    public let commonTarget: Int
    public let mineDone: Bool
    public let partnerDone: Bool
    public let bothDone: Bool

    public init(mine: Int, partner: Int, common: Int, commonTarget: Int,
                mineDone: Bool, partnerDone: Bool, bothDone: Bool) {
        self.mine = mine
        self.partner = partner
        self.common = common
        self.commonTarget = commonTarget
        self.mineDone = mineDone
        self.partnerDone = partnerDone
        self.bothDone = bothDone
    }
}

public struct DuoReward: Sendable, Equatable {
    public let points: Int
    public let doubled: Bool

    public init(points: Int, doubled: Bool) {
        self.points = points
        self.doubled = doubled
    }
}

public enum DuoInviteRefusal: String, Sendable, Hashable {
    case `self`
    case locked
    case inviteeLocked = "invitee-locked"
    case notFriends = "not-friends"
    case alreadyInDuo = "already-in-duo"
    case inviteeInDuo = "invitee-in-duo"
}

public enum DuoInviteDecision: Sendable, Equatable {
    case allowed
    case refused(DuoInviteRefusal)
}

public enum DuoStatus: String, CaseIterable, Codable, Sendable, Hashable {
    case invited
    case active
    case completed
    case abandoned
    case expired
}

public enum DuoAction: String, Sendable, Hashable {
    case accept
    case abandon
    case expire
    case complete
}

public enum DuoActor: String, Codable, Sendable, Hashable {
    case inviter
    case invitee
}

public enum GameDuo {
    public static let minLevel = 20
    /// Les points de base d'une mission en duo : une semaine, soit l'équivalent de deux difficiles.
    public static let basePoints = 300
    /// Quand les deux finissent, chacun touche le double.
    public static let rewardMultiplier = 2

    public static let templates: [DuoTemplate] = [
        DuoTemplate(key: "duo-messages", signal: .axis(.textMessage), basePartTarget: 40, prism: false),
        DuoTemplate(key: "duo-voice", signal: .axis(.audioMessage), basePartTarget: 5, prism: false),
        DuoTemplate(key: "duo-reactions", signal: .axis(.reaction), basePartTarget: 20, prism: false),
        DuoTemplate(key: "duo-replies", signal: .replyDistinctConversations, basePartTarget: 8, prism: false),
        DuoTemplate(key: "duo-stories", signal: .axis(.story), basePartTarget: 3, prism: false),
        DuoTemplate(key: "duo-prism", signal: .foreignLanguageMessage, basePartTarget: 8, prism: true),
    ]

    private static func pairSeed(_ a: String, _ b: String) -> String {
        GameOrdering.compare(a, b) <= 0 ? "\(a)&\(b)" : "\(b)&\(a)"
    }

    /// Chaque gabarit de duo reste un signal que la passerelle observe déjà — la liste des signaux, pas celle
    /// des gabarits du jour : retirer une mission du jour (#9634) ne change pas le duo d'une semaine en cours.
    private static var catalog: [DuoTemplate] {
        let known = Set(MissionSignal.observed)
        return templates.filter { known.contains($0.signal) }
    }

    /// La mission de la semaine du duo, `nil` quand aucun gabarit ne convient aux deux.
    public static func draw(userA: String, userB: String, weekKey: String, levelA: Int, levelB: Int,
                            unavailableSignals: [MissionSignal]) -> DuoMission? {
        let blocked = Set(unavailableSignals)
        let pool = catalog.filter { !blocked.contains($0.signal) }
        var rng = GameRandom(parts: GameSeedParts(userId: pairSeed(userA, userB), dayKey: weekKey, salt: "duo"))
        let index = rng.pickIndex(length: pool.count)
        guard pool.indices.contains(index) else { return nil }
        let picked = pool[index]
        let partTarget = GameMissions.objective(baseTarget: picked.basePartTarget, level: min(levelA, levelB))
        return DuoMission(
            weekKey: weekKey,
            templateKey: picked.key,
            signal: picked.signal,
            prism: picked.prism,
            partTarget: partTarget,
            commonTarget: partTarget * 2,
            basePoints: basePoints
        )
    }

    public static func progress(partTarget: Int, mine: Int, partner: Int) -> DuoProgress {
        let mineCapped = min(max(0, mine), partTarget)
        let partnerCapped = min(max(0, partner), partTarget)
        let mineDone = mineCapped >= partTarget
        let partnerDone = partnerCapped >= partTarget
        return DuoProgress(
            mine: mineCapped,
            partner: partnerCapped,
            common: mineCapped + partnerCapped,
            commonTarget: partTarget * 2,
            mineDone: mineDone,
            partnerDone: partnerDone,
            bothDone: mineDone && partnerDone
        )
    }

    /// Ce que ma part vaut AU TOTAL : rien tant qu'elle n'est pas faite, la mission
    /// seule quand l'autre n'a pas fini, le double quand les deux ont fini.
    public static func reward(level: Int, flameDays: Int, mineDone: Bool, partnerDone: Bool) -> DuoReward {
        guard mineDone else { return DuoReward(points: 0, doubled: false) }
        let base = GameMissions.reward(basePoints: basePoints, level: level, flameDays: flameDays)
        return partnerDone
            ? DuoReward(points: base * rewardMultiplier, doubled: true)
            : DuoReward(points: base, doubled: false)
    }

    public static func canInvite(inviterLevelRecord: Int, inviteeLevelRecord: Int, areFriends: Bool,
                                 inviterHasDuo: Bool, inviteeHasDuo: Bool, isSelf: Bool) -> DuoInviteDecision {
        if isSelf { return .refused(.`self`) }
        if inviterLevelRecord < minLevel { return .refused(.locked) }
        if inviteeLevelRecord < minLevel { return .refused(.inviteeLocked) }
        if !areFriends { return .refused(.notFriends) }
        if inviterHasDuo { return .refused(.alreadyInDuo) }
        if inviteeHasDuo { return .refused(.inviteeInDuo) }
        return .allowed
    }

    /// Le statut suivant, `nil` quand le geste n'a pas de sens dans l'état actuel.
    public static func transition(status: DuoStatus, action: DuoAction, actor: DuoActor) -> DuoStatus? {
        switch (status, action) {
        case (.invited, .accept): actor == .invitee ? .active : nil
        case (.invited, .abandon), (.active, .abandon): .abandoned
        case (.invited, .expire), (.active, .expire): .expired
        case (.active, .complete): .completed
        default: nil
        }
    }
}
