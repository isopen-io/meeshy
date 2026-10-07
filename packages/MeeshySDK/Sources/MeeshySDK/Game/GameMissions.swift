import Foundation

// MARK: - Les missions du jour (#9373)
//
// MIROIR de `packages/shared/utils/game/missions.ts` — trois par jour (facile,
// moyenne, difficile), la difficile devenant mission d'Or à partir du niveau 50
// ou de 50 Meeshes gardées.
//
// ## Ce qu'un GABARIT peut demander (#9634)
//
// Seulement un GESTE de l'utilisateur que la passerelle CRÉDITE sur un axe
// d'engagement, et dont le libellé dit exactement le geste compté. Les faits de
// tiers, la langue déclarée par le client et les gestes plus étroits que leur
// libellé ont quitté le catalogue. La mission d'Or est la difficile PORTÉE à
// l'Or : mêmes gestes, même objectif, points et Gloire de l'Or. Le client ne
// mesure rien : il tire les mêmes gabarits que le serveur pour montrer le
// coffre, mais l'avancement vient toujours du serveur.
//
// ## Le tirage
//
// Déterministe : mulberry32 sur un hachage de `userId|jour|missions`. Le nombre
// de tirages consommés est fixe (un pour l'emplacement Prisme, un par
// emplacement) : les entrées identiques rendent des sorties identiques partout.
//
// Objectif et récompense se calculent en ENTIERS exacts : le flottant
// `1 + 0,3 × bande` se trompe d'un ulp là où `⌈⌉` ne pardonne pas.

public enum MissionDifficulty: String, CaseIterable, Codable, Sendable, Hashable {
    case easy
    case medium
    case hard
    case gold
}

/// Ce que la passerelle observe. Une CHAÎNE ouverte : un signal ajouté au
/// serveur avant la mise à jour d'un client ne doit jamais casser l'écran.
public struct MissionSignal: RawRepresentable, Codable, Sendable, Hashable {
    public let rawValue: String

    public init(rawValue: String) {
        self.rawValue = rawValue
    }

    public init(_ rawValue: String) {
        self.rawValue = rawValue
    }

    public init(from decoder: Decoder) throws {
        rawValue = try decoder.singleValueContainer().decode(String.self)
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(rawValue)
    }

    /// Un axe d'engagement incrémenté : `axis:content.post`.
    public static func axis(_ key: EngagementAxisKey) -> MissionSignal {
        MissionSignal("axis:\(key.rawValue)")
    }

    /// Une opération créditée hors des axes (`tool.post_reaction`, `social.email_invite`…).
    public static func operation(_ key: String) -> MissionSignal {
        MissionSignal("axis:\(key)")
    }

    public static let replyDistinctConversations = MissionSignal("reply-distinct-conversations")
    public static let foreignLanguageMessage = MissionSignal("foreign-language-message")
    public static let repliesReceivedDistinctAuthors = MissionSignal("replies-received-distinct-authors")
    public static let reelPublished = MissionSignal("reel-published")
    public static let conversationStarted = MissionSignal("conversation-started")
    public static let storyReply = MissionSignal("story-reply")
    public static let commentOthersPost = MissionSignal("comment-others-post")
    public static let commentStrangerPublicPost = MissionSignal("comment-stranger-public-post")
    public static let crossLanguageExchange = MissionSignal("cross-language-exchange")
    public static let replyInTheirLanguage = MissionSignal("reply-in-their-language")

    /// Les faits que la passerelle pose au point unique du geste (#9635).
    public static let facts: [MissionSignal] = [
        replyDistinctConversations, foreignLanguageMessage, repliesReceivedDistinctAuthors, reelPublished,
        conversationStarted, storyReply, commentOthersPost, commentStrangerPublicPost, crossLanguageExchange,
        replyInTheirLanguage,
    ]

    /// Ce que la passerelle observe et qu'un duo peut attendre : chaque axe d'engagement, puis les faits.
    public static let observed: [MissionSignal] = EngagementAxisKey.allCases.map { axis($0) } + facts
}

/// Les quatre buts du porteur (#9635).
public enum MissionGoal: String, CaseIterable, Sendable, Equatable {
    case animate
    case courage
    case languages
    case reach
}

/// Ce qu'un défi peut exiger du profil.
public enum MissionCapability: String, CaseIterable, Sendable, Equatable {
    case contacts
    case activeConversations = "active-conversations"
    case communities
    case multilingual
}

public struct MissionTemplate: Sendable, Equatable {
    public let key: String
    public let difficulty: MissionDifficulty
    public let goal: MissionGoal
    public let signal: MissionSignal
    /// L'objectif quand le profil n'est pas connu, avant la bande de niveau.
    public let baseTarget: Int
    public let minTarget: Int
    public let maxTarget: Int
    /// Points par unité d'objectif, en plus de la base de la difficulté.
    public let unitPoints: Int
    /// Défi de langue : le jour du Prisme en garantit un.
    public let prism: Bool
    public let weight: Int
    public let requires: [MissionCapability]

    public init(key: String, difficulty: MissionDifficulty, goal: MissionGoal, signal: MissionSignal, baseTarget: Int,
                minTarget: Int, maxTarget: Int, unitPoints: Int, prism: Bool = false, weight: Int = 4,
                requires: [MissionCapability] = []) {
        self.key = key
        self.difficulty = difficulty
        self.goal = goal
        self.signal = signal
        self.baseTarget = baseTarget
        self.minTarget = minTarget
        self.maxTarget = maxTarget
        self.unitPoints = unitPoints
        self.prism = prism
        self.weight = weight
        self.requires = requires
    }

    /// La base de points de sa difficulté.
    public var basePoints: Int { GameMissions.basePoints(for: difficulty) }

    func promoted(to difficulty: MissionDifficulty) -> MissionTemplate {
        MissionTemplate(key: key, difficulty: difficulty, goal: goal, signal: signal, baseTarget: baseTarget,
                        minTarget: minTarget, maxTarget: maxTarget, unitPoints: unitPoints,
                        prism: prism, weight: weight, requires: requires)
    }
}

/// Une mission tirée : objectif et récompense déjà calculés pour le niveau et la Flamme.
public struct DrawnMission: Sendable, Equatable {
    public let difficulty: MissionDifficulty
    public let templateKey: String
    public let signal: MissionSignal
    public let prism: Bool
    public let target: Int
    /// Points crédités à la validation, bonus de Flamme compris.
    public let reward: Int
    /// Gloire de la mission : `GameMissions.glory(of:)`, lue dans `GameGlory.points`.
    public let glory: Int

    public init(difficulty: MissionDifficulty, templateKey: String, signal: MissionSignal, prism: Bool,
                target: Int, reward: Int, glory: Int) {
        self.difficulty = difficulty
        self.templateKey = templateKey
        self.signal = signal
        self.prism = prism
        self.target = target
        self.reward = reward
        self.glory = glory
    }
}

public struct DailyMissionDraw: Sendable, Equatable {
    public let dayKey: String
    /// Jour où un gabarit Prisme est garanti.
    public let prismDay: Bool
    /// Dans l'ordre facile, moyenne, difficile (ou Or).
    public let missions: [DrawnMission]

    public init(dayKey: String, prismDay: Bool, missions: [DrawnMission]) {
        self.dayKey = dayKey
        self.prismDay = prismDay
        self.missions = missions
    }
}

public struct MissionDrawInput: Sendable, Equatable {
    public let userId: String
    public let dayKey: String
    public let level: Int
    public let flameDays: Int
    /// Meeshes gardées (le trésor) : à 50 ou plus, la mission d'Or remplace la difficile.
    public let treasury: Int
    /// Signaux impossibles pour CE compte — jamais tirés.
    public let unavailableSignals: [MissionSignal]

    public init(userId: String, dayKey: String, level: Int, flameDays: Int, treasury: Int,
                unavailableSignals: [MissionSignal] = []) {
        self.userId = userId
        self.dayKey = dayKey
        self.level = level
        self.flameDays = flameDays
        self.treasury = treasury
        self.unavailableSignals = unavailableSignals
    }
}

public enum GameMissions {
    /// Les missions du jour s'ouvrent au niveau 5.
    public static let minLevel = 5
    /// Changer une mission : une Meesh, une fois par jour, même difficulté.
    public static let rerollPrice = 1
    public static let rerollPerDay = 1
    /// Niveau ou nombre de Meeshes gardées qui ouvre la mission d'Or.
    public static let goldMinLevel = 50
    public static let goldMinTreasury = 50

    /// La base de points de chaque difficulté, avant l'objectif, la bande et la Flamme.
    public static func basePoints(for difficulty: MissionDifficulty) -> Int {
        switch difficulty {
        case .easy: 40
        case .medium: 80
        case .hard: 160
        case .gold: 320
        }
    }

    private static func t(_ key: String, _ difficulty: MissionDifficulty, _ goal: MissionGoal, _ signal: MissionSignal,
                          base: Int, min: Int, max: Int, unit: Int, prism: Bool = false,
                          weight: Int = 4, requires: [MissionCapability] = []) -> MissionTemplate {
        MissionTemplate(key: key, difficulty: difficulty, goal: goal, signal: signal, baseTarget: base,
                        minTarget: min, maxTarget: max, unitPoints: unit, prism: prism,
                        weight: weight, requires: requires)
    }

    /// Le catalogue (#9635) — MIROIR de `packages/shared/utils/game/mission-catalog.ts`, dans le même ordre.
    public static let templates: [MissionTemplate] = [
        t("send-texts", .easy, .animate, .axis(.textMessage), base: 5, min: 1, max: 15, unit: 12),
        t("send-attachments", .easy, .animate, .axis(.attachment), base: 2, min: 1, max: 6, unit: 16),
        t("react-messages", .easy, .animate, .axis(.reaction), base: 5, min: 1, max: 15, unit: 8, requires: [.contacts]),
        t("react-posts", .easy, .animate, .operation("tool.post_reaction"), base: 5, min: 1, max: 15, unit: 6),
        t("use-stickers", .easy, .animate, .axis(.sticker), base: 2, min: 1, max: 6, unit: 6),
        t("comment-text", .medium, .animate, .commentOthersPost, base: 3, min: 1, max: 6, unit: 12),
        t("publish-story", .medium, .animate, .axis(.story), base: 1, min: 1, max: 2, unit: 40),
        t("publish-post", .medium, .animate, .axis(.post), base: 1, min: 1, max: 1, unit: 40),
        t("reply-story", .medium, .animate, .storyReply, base: 1, min: 1, max: 3, unit: 15, requires: [.contacts]),
        t("reply-conversations", .medium, .animate, .replyDistinctConversations, base: 3, min: 1, max: 4, unit: 15,
          requires: [.contacts]),
        t("join-community", .medium, .animate, .operation("social.community_joined"), base: 1, min: 1, max: 1, unit: 15),
        t("long-chat", .hard, .animate, .axis(.textMessage), base: 10, min: 3, max: 40, unit: 12),
        t("publish-posts", .hard, .animate, .axis(.post), base: 2, min: 2, max: 3, unit: 40),
        t("publish-reel", .hard, .animate, .reelPublished, base: 1, min: 1, max: 1, unit: 250),
        t("voice-comments", .hard, .animate, .axis(.audioComment), base: 2, min: 1, max: 3, unit: 20),
        t("reply-conversations-wide", .hard, .animate, .replyDistinctConversations, base: 6, min: 2, max: 8, unit: 15,
          requires: [.activeConversations]),
        t("gold-reply-conversations", .gold, .animate, .replyDistinctConversations, base: 8, min: 3, max: 12, unit: 15,
          requires: [.activeConversations]),
        t("gold-replies-received", .gold, .animate, .repliesReceivedDistinctAuthors, base: 4, min: 2, max: 6, unit: 25,
          requires: [.activeConversations]),

        t("send-voice", .easy, .courage, .axis(.audioMessage), base: 1, min: 1, max: 5, unit: 20),
        t("write-someone-new", .medium, .courage, .axis(.privateConversation), base: 1, min: 1, max: 3, unit: 20),
        t("start-conversation", .medium, .courage, .conversationStarted, base: 1, min: 1, max: 2, unit: 25),
        t("community-hello", .medium, .courage, .axis(.communityConversation), base: 1, min: 1, max: 2, unit: 20,
          requires: [.communities]),
        t("comment-stranger-post", .medium, .courage, .commentStrangerPublicPost, base: 1, min: 1, max: 3, unit: 20),

        t("prism-foreign-messages", .medium, .languages, .foreignLanguageMessage, base: 2, min: 1, max: 6, unit: 15,
          prism: true, requires: [.multilingual]),
        t("cross-language-chat", .medium, .languages, .crossLanguageExchange, base: 1, min: 1, max: 3, unit: 20,
          prism: true, requires: [.contacts]),
        t("prism-foreign-exchange", .hard, .languages, .foreignLanguageMessage, base: 5, min: 2, max: 15, unit: 15,
          prism: true, requires: [.multilingual]),
        t("reply-their-language", .hard, .languages, .replyInTheirLanguage, base: 1, min: 1, max: 5, unit: 25,
          prism: true, requires: [.multilingual, .contacts]),

        t("create-invite-link", .easy, .reach, .operation("social.affiliate_link_created"), base: 1, min: 1, max: 1,
          unit: 10),
        t("share-link", .medium, .reach, .axis(.share), base: 1, min: 1, max: 3, unit: 30),
        t("invite-contact", .medium, .reach, .operation("social.email_invite"), base: 1, min: 1, max: 3, unit: 20),
        t("invite-joined", .gold, .reach, .axis(.inviteJoined), base: 1, min: 1, max: 1, unit: 400, weight: 1),
    ]

    /// Les gabarits d'une difficulté ; l'Or tire parmi les siens ET les difficiles portés à l'Or.
    public static func catalog(for difficulty: MissionDifficulty) -> [MissionTemplate] {
        guard difficulty == .gold else { return templates.filter { $0.difficulty == difficulty } }
        return templates.filter { $0.difficulty == .gold }
            + templates.filter { $0.difficulty == .hard }.map { $0.promoted(to: .gold) }
    }

    private static func clampLevel(_ level: Int) -> Int {
        min(GameLevels.maxLevel, max(GameLevels.minLevel, level))
    }

    /// bande = ⌊niveau ÷ 10⌋.
    public static func band(forLevel level: Int) -> Int {
        clampLevel(level) / 10
    }

    /// objectif = ⌈ base × (1 + 0,3 × bande) ⌉, en entiers : ⌈ base × (10 + 3 × bande) ÷ 10 ⌉.
    public static func objective(baseTarget: Int, level: Int) -> Int {
        (baseTarget * (10 + 3 * band(forLevel: level)) + 9) / 10
    }

    /// récompense = base × (1 + 0,15 × bande) × (1 + bonus de Flamme), arrondie
    /// au plus proche (demi vers le haut), en entiers : le bonus est un pour cent
    /// entier (`GameFlame.bonusPercent`).
    public static func reward(basePoints: Int, level: Int, flameDays: Int) -> Int {
        let numerator = basePoints * (100 + 15 * band(forLevel: level)) * (100 + GameFlame.bonusPercent(forDays: flameDays))
        return (numerator + 5000) / 10_000
    }

    private static func drawn(_ template: MissionTemplate, level: Int, flameDays: Int) -> DrawnMission {
        let target = min(template.maxTarget, max(template.minTarget, objective(baseTarget: template.baseTarget, level: level)))
        return DrawnMission(
            difficulty: template.difficulty,
            templateKey: template.key,
            signal: template.signal,
            prism: template.prism,
            target: target,
            reward: reward(basePoints: template.basePoints + template.unitPoints * target, level: level, flameDays: flameDays),
            glory: glory(of: template)
        )
    }

    /// La Gloire d'un défi : l'Or et « faire connaître » en portent ; le montant se lit dans `GameGlory.points`.
    public static func glory(of template: MissionTemplate) -> Int {
        template.difficulty == .gold || template.goal == .reach ? GameGlory.points.goldMission : 0
    }

    /// Un tirage pondéré : une valeur du générateur ; à poids égaux, le même indice que `pickIndex`.
    private static func pickWeighted(_ rng: inout GameRandom, _ pool: [MissionTemplate]) -> MissionTemplate? {
        let weights = pool.map { max(0, $0.weight) }
        let ticket = rng.next() * Double(weights.reduce(0, +))
        var sum = 0
        for (index, weight) in weights.enumerated() {
            sum += weight
            if Double(sum) > ticket { return pool[index] }
        }
        return pool.last
    }

    private static func pool(_ difficulty: MissionDifficulty, excluding excluded: Set<MissionSignal>,
                             prismOnly: Bool) -> [MissionTemplate] {
        let candidates = catalog(for: difficulty).filter { !excluded.contains($0.signal) }
        let prism = candidates.filter(\.prism)
        return prismOnly && !prism.isEmpty ? prism : candidates
    }

    /// Jour Prisme garanti : un jour sur trois, décalé par utilisateur.
    public static func isPrismDay(userId: String, dayKey: String) -> Bool {
        guard let day = GameDay.number(of: dayKey) else { return false }
        return (day + Int(GameSeed.fnv1a(userId) % 3)) % 3 == 0
    }

    public static func draw(_ input: MissionDrawInput) -> DailyMissionDraw {
        let level = clampLevel(input.level)
        var rng = GameRandom(parts: GameSeedParts(userId: input.userId, dayKey: input.dayKey, salt: "missions"))
        let top: MissionDifficulty =
            level >= goldMinLevel || input.treasury >= goldMinTreasury ? .gold : .hard
        let prismDay = isPrismDay(userId: input.userId, dayKey: input.dayKey)

        let prismCandidates: [MissionDifficulty] = top == .gold ? [.medium] : [.medium, .hard]
        let prismDifficulty = prismCandidates[rng.pickIndex(length: prismCandidates.count)]

        var used = Set(input.unavailableSignals)
        var byDifficulty: [MissionDifficulty: DrawnMission] = [:]
        for difficulty in [top, .medium, .easy] {
            let candidates = pool(difficulty, excluding: used, prismOnly: prismDay && difficulty == prismDifficulty)
            guard let picked = pickWeighted(&rng, candidates) else { continue }
            used.insert(picked.signal)
            byDifficulty[difficulty] = drawn(picked, level: level, flameDays: input.flameDays)
        }

        return DailyMissionDraw(
            dayKey: input.dayKey,
            prismDay: prismDay,
            missions: [MissionDifficulty.easy, .medium, top].compactMap { byDifficulty[$0] }
        )
    }

    /// Changer UNE mission du jour : même difficulté, un autre gabarit, jamais un
    /// signal déjà tiré ce jour-là. `rerollCount` varie la graine à chaque
    /// changement. `nil` quand aucun gabarit ne convient.
    public static func reroll(userId: String, dayKey: String, level: Int, flameDays: Int,
                              missions: [DrawnMission], index: Int, rerollCount: Int,
                              unavailableSignals: [MissionSignal] = []) -> DrawnMission? {
        guard missions.indices.contains(index) else { return nil }
        let current = missions[index]
        let excluded = Set(unavailableSignals + missions.map(\.signal))
        let candidates = pool(current.difficulty, excluding: excluded, prismOnly: false)
            .filter { $0.key != current.templateKey }
        var rng = GameRandom(parts: GameSeedParts(
            userId: userId, dayKey: dayKey, salt: "reroll:\(index):\(max(0, rerollCount))"))
        guard let picked = pickWeighted(&rng, candidates) else { return nil }
        return drawn(picked, level: clampLevel(level), flameDays: flameDays)
    }
}
