import Foundation

// MARK: - Les missions du jour (#9373)
//
// MIROIR de `packages/shared/utils/game/missions.ts` — trois par jour (facile,
// moyenne, difficile), la difficile devenant mission d'Or à partir du niveau 50
// ou de 50 Meeshes gardées.
//
// ## Ce qu'un SIGNAL peut être
//
// Seulement un fait que la passerelle OBSERVE À L'ÉCRITURE : un axe d'engagement
// incrémenté, une réponse dans une conversation distincte, un message dans une
// autre langue que la langue système de l'expéditeur, une réponse reçue d'un
// auteur distinct. Le client ne mesure rien : il tire les mêmes gabarits que le
// serveur pour montrer le coffre, mais l'avancement vient toujours du serveur.
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

    public static let replyDistinctConversations = MissionSignal("reply-distinct-conversations")
    public static let foreignLanguageMessage = MissionSignal("foreign-language-message")
    public static let repliesReceivedDistinctAuthors = MissionSignal("replies-received-distinct-authors")
}

public struct MissionTemplate: Sendable, Equatable {
    public let key: String
    public let difficulty: MissionDifficulty
    public let signal: MissionSignal
    public let baseTarget: Int
    public let basePoints: Int
    /// Mission du Prisme (langues, traduction) : au moins un jour sur trois.
    public let prism: Bool

    public init(key: String, difficulty: MissionDifficulty, signal: MissionSignal, baseTarget: Int,
                basePoints: Int, prism: Bool) {
        self.key = key
        self.difficulty = difficulty
        self.signal = signal
        self.baseTarget = baseTarget
        self.basePoints = basePoints
        self.prism = prism
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
    /// Gloire de la mission : 40 pour l'Or, `0` sinon.
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

    private static func template(_ key: String, _ difficulty: MissionDifficulty, _ signal: MissionSignal,
                                 _ baseTarget: Int, prism: Bool = false) -> MissionTemplate {
        let basePoints: Int = switch difficulty {
        case .easy: 30
        case .medium: 60
        case .hard: 120
        case .gold: 250
        }
        return MissionTemplate(key: key, difficulty: difficulty, signal: signal, baseTarget: baseTarget,
                               basePoints: basePoints, prism: prism)
    }

    /// Le catalogue — dix-neuf gabarits, du plus doux à l'Or.
    public static let templates: [MissionTemplate] = [
        template("react-messages", .easy, .axis(.reaction), 5),
        template("send-voice", .easy, .axis(.audioMessage), 1),
        template("send-texts", .easy, .axis(.textMessage), 5),
        template("use-stickers", .easy, .axis(.sticker), 2),
        template("send-attachments", .easy, .axis(.attachment), 2),

        template("reply-conversations", .medium, .replyDistinctConversations, 3),
        template("comment-text", .medium, .axis(.textComment), 3),
        template("publish-story", .medium, .axis(.story), 1),
        template("publish-post", .medium, .axis(.post), 1),
        template("share-link", .medium, .axis(.share), 1),
        template("prism-foreign-messages", .medium, .foreignLanguageMessage, 2, prism: true),

        template("prism-foreign-exchange", .hard, .foreignLanguageMessage, 5, prism: true),
        template("reply-conversations-wide", .hard, .replyDistinctConversations, 6),
        template("publish-posts", .hard, .axis(.post), 2),
        template("voice-comments", .hard, .axis(.audioComment), 2),
        template("publish-reel", .hard, .axis(.reel), 1),
        template("long-chat", .hard, .axis(.textMessage), 20),

        template("gold-replies-received", .gold, .repliesReceivedDistinctAuthors, 4),
        template("gold-reply-conversations", .gold, .replyDistinctConversations, 8),
    ]

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
        DrawnMission(
            difficulty: template.difficulty,
            templateKey: template.key,
            signal: template.signal,
            prism: template.prism,
            target: objective(baseTarget: template.baseTarget, level: level),
            reward: reward(basePoints: template.basePoints, level: level, flameDays: flameDays),
            glory: template.difficulty == .gold ? GameGlory.points.goldMission : 0
        )
    }

    private static func pool(_ difficulty: MissionDifficulty, excluding excluded: Set<MissionSignal>,
                             prismOnly: Bool) -> [MissionTemplate] {
        let candidates = templates.filter { $0.difficulty == difficulty && !excluded.contains($0.signal) }
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
            let index = rng.pickIndex(length: candidates.count)
            guard candidates.indices.contains(index) else { continue }
            let picked = candidates[index]
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
        let picked = rng.pickIndex(length: candidates.count)
        guard candidates.indices.contains(picked) else { return nil }
        return drawn(candidates[picked], level: clampLevel(level), flameDays: flameDays)
    }
}
