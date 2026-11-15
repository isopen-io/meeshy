import Foundation

// MARK: - Le calendrier des saisons SERVI (#10016, #10232)
//
// MIROIR de `packages/shared/utils/game/season-schedule.ts` — la loi de LECTURE.
// La passerelle sert un calendrier (`GET /api/v1/me/game/seasons/calendar`) : une
// définition par saison programmée (numéro, LUNDI d'ouverture, statut, thème,
// points d'étape bornés, textes en sept langues). Ce qui n'est pas défini se
// DÉRIVE de `GameSeason` : la saison 1 ouvre le `GameSeason.oneStart`, chaque
// saison suit la précédente de 56 jours, le thème tourne sur `themeKeys`. Le
// calendrier vide (`SeasonSchedule.default`) rend donc EXACTEMENT `GameSeason`.
//
// - Une saison DÉCALÉE pose une ancre : elle ouvre à son lundi, laisse un
//   intervalle sans saison derrière la précédente, les suivantes s'enchaînent
//   depuis elle.
// - Une saison EN PAUSE n'a plus de dates, ni celles qui la suivent.
//
// La PROGRAMMATION (`applySeasonEdit`) n'a pas de miroir : iOS lit le calendrier,
// l'admin le programme depuis le web. Sur divergence, c'est le TS qui a raison
// (`game.vectors.json`, loi `season-schedule`).

public enum SeasonDefinitionStatus: String, Codable, Sendable, Hashable {
    case scheduled
    case paused
}

/// Les textes d'une saison dans une langue — les limites d'un événement in-app App Store.
public struct SeasonCopy: Codable, Sendable, Equatable {
    public let title: String
    public let tagline: String
    public let description: String

    public init(title: String, tagline: String, description: String) {
        self.title = title
        self.tagline = tagline
        self.description = description
    }
}

public struct SeasonDefinition: Codable, Sendable, Equatable {
    public let number: Int
    /// Un lundi, `AAAA-MM-JJ`. Pour une saison en pause : la date proposée, ignorée.
    public let startDay: String
    public let status: SeasonDefinitionStatus
    public let themeKey: String
    /// Les points d'une étape ordinaire, dans `[SeasonSchedule.stepPointsMin, SeasonSchedule.stepPointsMax]`.
    public let stepPoints: Int
    /// Par langue de la fiche (`SeasonSchedule.copyLocales`), `nil` sans texte propre.
    public let copy: [String: SeasonCopy]?

    public init(number: Int, startDay: String, status: SeasonDefinitionStatus, themeKey: String,
                stepPoints: Int, copy: [String: SeasonCopy]?) {
        self.number = number
        self.startDay = startDay
        self.status = status
        self.themeKey = themeKey
        self.stepPoints = stepPoints
        self.copy = copy
    }
}

public struct SeasonSchedule: Codable, Sendable, Equatable {
    /// Croît à chaque écriture : l'ETag de la lecture servie, la clé du cache hors ligne.
    public let revision: Int
    /// Les définitions CONFORMES, triées par numéro (`normalize`).
    public let seasons: [SeasonDefinition]

    public init(revision: Int, seasons: [SeasonDefinition]) {
        self.revision = revision
        self.seasons = seasons
    }

    /// Le repli : aucune définition, la constante de `GameSeason`.
    public static let `default` = SeasonSchedule(revision: 0, seasons: [])

    public static let stepPointsMin = 50
    public static let stepPointsMax = 200
    public static let stepPointsStep = 10
    /// Les sept langues de la fiche — arabe en miroir.
    public static let copyLocales = ["fr", "en", "es", "de", "it", "pt-BR", "ar"]
    public static let copyLimits = (title: 30, tagline: 50, description: 120)

    /// L'ETag que la passerelle pose sur la lecture de cette révision.
    public var etag: String { "\"season-schedule-\(revision)\"" }

    // MARK: Lire un calendrier reçu

    /// Lit un calendrier reçu (réseau, disque) et en garde ce qui est conforme : une définition illisible ou qui
    /// chevauche la précédente est ignorée — la saison retombe alors sur la dérivation. Illisible : le repli.
    public static func normalize(data: Data) -> SeasonSchedule {
        guard let raw = try? JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed]) else { return .default }
        return normalize(raw)
    }

    /// La même lecture sur une valeur Foundation (`JSONSerialization`).
    public static func normalize(_ raw: Any?) -> SeasonSchedule {
        guard let record = raw as? [String: Any],
              let revision = integer(record["revision"]), revision >= 0,
              let list = record["seasons"] as? [Any] else { return .default }
        let candidates = list.compactMap(definition(from:)).enumerated()
            .sorted { $0.element.number != $1.element.number ? $0.element.number < $1.element.number : $0.offset < $1.offset }
            .map(\.element)
        var accepted: [SeasonDefinition] = []
        for def in candidates {
            if accepted.contains(where: { $0.number == def.number }) { continue }
            // Les dates se vérifient pauses IGNORÉES (programmée OU en pause) : une saison en pause garde sa date
            // prévue, et ce qui la suit doit rester cohérent avec elle.
            if def.number > 1 {
                let previous = SchedulePlan.dates(SeasonSchedule(revision: 0, seasons: accepted)).start(of: def.number - 1)
                if let previous, let gap = GameDay.diff(from: previous, to: def.startDay), gap < GameSeason.days { continue }
            }
            accepted.append(def)
        }
        return SeasonSchedule(revision: revision, seasons: accepted)
    }

    public static func isLawfulStepPoints(_ value: Int) -> Bool {
        (stepPointsMin...stepPointsMax).contains(value) && value % stepPointsStep == 0
    }

    // MARK: Les lectures

    /// Le calendrier d'une saison ; `nil` en pause (ou derrière une pause) ou pour un numéro invalide.
    public func calendar(number: Int) -> SeasonCalendar? {
        guard number >= 1 else { return nil }
        return SchedulePlan(self).calendar(of: number)
    }

    /// La saison qui contient ce jour ; `nil` avant la première, dans un intervalle ou pendant une pause.
    public func season(at dayKey: String) -> Int? {
        guard GameDay.isDayKey(dayKey) else { return nil }
        let plan = SchedulePlan(self)
        guard let n = plan.lastStarted(at: dayKey), let calendar = plan.calendar(of: n),
              let day = GameDay.number(of: dayKey), let end = GameDay.number(of: calendar.endDay) else { return nil }
        return day <= end ? n : nil
    }

    /// La semaine de saison, de 1 à 8 ; `nil` hors saison.
    public func week(at dayKey: String) -> Int? {
        guard let n = season(at: dayKey), let start = SchedulePlan(self).start(of: n),
              let elapsed = GameDay.diff(from: start, to: dayKey) else { return nil }
        return elapsed / 7 + 1
    }

    /// La saison d'un moment, la fermeture du dimanche 20 h comprise.
    public func season(of moment: LeagueMoment) -> Int? {
        season(at: GameLeague.weekOfMoment(moment))
    }

    /// La saison À VENIR : hors saison (avant la première, dans un intervalle), la prochaine programmée ; `nil`
    /// pendant une saison, ou quand la suivante est en pause.
    public func upcoming(of moment: LeagueMoment) -> SeasonCalendar? {
        let week = GameLeague.weekOfMoment(moment)
        guard season(at: week) == nil else { return nil }
        let plan = SchedulePlan(self)
        return plan.calendar(of: plan.lastStarted(at: week).map { $0 + 1 } ?? 1)
    }

    public func status(number: Int) -> SeasonDefinitionStatus {
        if let paused = SchedulePlan(self).pausedFrom, number >= paused { return .paused }
        return .scheduled
    }

    /// La définition d'une saison : celle du calendrier, ou la dérivation (dates enchaînées, thème en boucle,
    /// points de la loi, sans texte propre).
    public func definition(number: Int) -> SeasonDefinition? {
        guard number >= 1 else { return nil }
        let plan = SchedulePlan(self)
        if let explicit = plan.byNumber[number] { return explicit }
        let anchor = SchedulePlan.dates(self).anchor(for: number)
        return SeasonDefinition(
            number: number,
            startDay: GameDay.add((number - anchor.number) * GameSeason.days, to: anchor.startDay) ?? anchor.startDay,
            status: status(number: number),
            themeKey: GameSeason.themeKeys[(number - 1) % GameSeason.themeKeys.count],
            stepPoints: GameSeason.stepPoints,
            copy: nil
        )
    }

    // MARK: La lecture d'une valeur brute — `typeof` et `Number.isInteger` de la loi TS

    private static func integer(_ value: Any?) -> Int? {
        guard let number = value as? NSNumber, CFGetTypeID(number) != CFBooleanGetTypeID() else { return nil }
        let double = number.doubleValue
        guard double.isFinite, double.rounded() == double, abs(double) < 1e15 else { return nil }
        return Int(double)
    }

    private static func definition(from raw: Any) -> SeasonDefinition? {
        guard let r = raw as? [String: Any],
              let number = integer(r["number"]), number >= 1,
              let startDay = r["startDay"] as? String, GameDay.isDayKey(startDay),
              GameLeague.weekdayIndex(of: startDay) == 0,
              let statusRaw = r["status"] as? String, let status = SeasonDefinitionStatus(rawValue: statusRaw),
              let themeKey = r["themeKey"] as? String, GameSeason.themeKeys.contains(themeKey),
              let stepPoints = integer(r["stepPoints"]), isLawfulStepPoints(stepPoints) else { return nil }
        // Des textes illisibles ne retirent QUE les textes : jamais les dates d'une saison, qui se décalerait
        // sinon en silence.
        let copy = lawfulCopy(r["copy"])
        return SeasonDefinition(number: number, startDay: startDay, status: status, themeKey: themeKey,
                                stepPoints: stepPoints, copy: copy)
    }

    /// Sept langues, trois textes chacune, dans les limites ; rien d'autre.
    static func lawfulCopy(_ value: Any?) -> [String: SeasonCopy]? {
        guard let record = value as? [String: Any], record.count == copyLocales.count else { return nil }
        var result: [String: SeasonCopy] = [:]
        for locale in copyLocales {
            guard let c = record[locale] as? [String: Any], c.count == 3,
                  let title = c["title"] as? String, lawfulText(title, max: copyLimits.title),
                  let tagline = c["tagline"] as? String, lawfulText(tagline, max: copyLimits.tagline),
                  let description = c["description"] as? String, lawfulText(description, max: copyLimits.description)
            else { return nil }
            result[locale] = SeasonCopy(title: title, tagline: tagline, description: description)
        }
        return result
    }

    /// Aucun lien, domaine ni adresse dans un texte de saison (il devient un événement App Store).
    private static let linkPattern = LiteralRegex.compile(
        pattern: #"[a-z][a-z0-9+.-]*://|www\.|[a-z0-9-]+\.[a-z]{2,}(?:/|(?![A-Za-z0-9_]))|@[a-z0-9-]+\."#, options: [.caseInsensitive])
    /// Aucune devise : une saison ne promet jamais d'argent. Le `\b` ASCII du TS s'écrit en regards explicites :
    /// celui d'ICU est Unicode, et un « é » collé au sigle ou au domaine y changerait le verdict.
    private static let moneyPattern = LiteralRegex.compile(
        pattern: #"[$€£¥₹₦₩₽¢]|(?<![A-Za-z0-9_])(?:USD|EUR|XAF|XOF|FCFA|GBP|CFA)(?![A-Za-z0-9_])"#, options: [.caseInsensitive])

    /// Ni contrôle, ni contrôle bidirectionnel, ni caractère sans chasse : rien qui retourne ou cache un texte.
    private static func isHidden(_ scalar: Unicode.Scalar) -> Bool {
        switch scalar.value {
        case 0x00...0x1F, 0x7F, 0x200B...0x200F, 0x202A...0x202E, 0x2060...0x2069, 0xFEFF: true
        default: false
        }
    }

    private static func matches(_ regex: NSRegularExpression, _ value: String) -> Bool {
        regex.firstMatch(in: value, range: NSRange(value.startIndex..., in: value)) != nil
    }

    private static func lawfulText(_ value: String, max: Int) -> Bool {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return !trimmed.isEmpty && trimmed == value && value.unicodeScalars.count <= max
            && !value.unicodeScalars.contains(where: isHidden)
            && !matches(linkPattern, value) && !matches(moneyPattern, value)
    }
}

// MARK: - Le plan : ancres, pause, définitions par numéro

private struct SchedulePlan {
    struct Anchor {
        let number: Int
        let startDay: String
    }

    let anchors: [Anchor]
    let pausedFrom: Int?
    let byNumber: [Int: SeasonDefinition]

    init(_ schedule: SeasonSchedule) {
        let sorted = schedule.seasons.enumerated()
            .sorted { $0.element.number != $1.element.number ? $0.element.number < $1.element.number : $0.offset < $1.offset }
            .map(\.element)
        var anchors = [Anchor(number: 1, startDay: GameSeason.oneStart)]
        var paused: Int?
        for def in sorted {
            if def.status == .paused {
                paused = def.number
                break
            }
            if def.number == 1 {
                anchors[0] = Anchor(number: 1, startDay: def.startDay)
            } else {
                anchors.append(Anchor(number: def.number, startDay: def.startDay))
            }
        }
        self.anchors = anchors
        self.pausedFrom = paused
        self.byNumber = Dictionary(sorted.map { ($0.number, $0) }, uniquingKeysWith: { _, last in last })
    }

    /// Le plan des DATES, pauses ignorées : la date prévue d'une saison en pause, ou derrière une pause.
    static func dates(_ schedule: SeasonSchedule) -> SchedulePlan {
        guard schedule.seasons.contains(where: { $0.status == .paused }) else { return SchedulePlan(schedule) }
        return SchedulePlan(SeasonSchedule(revision: schedule.revision, seasons: schedule.seasons.map { d in
            d.status == .paused
                ? SeasonDefinition(number: d.number, startDay: d.startDay, status: .scheduled, themeKey: d.themeKey,
                                   stepPoints: d.stepPoints, copy: d.copy)
                : d
        }))
    }

    func anchor(for n: Int) -> Anchor {
        var found = anchors[0]
        for anchor in anchors where anchor.number <= n { found = anchor }
        return found
    }

    /// Le lundi d'ouverture de la saison, `nil` en pause (ou derrière une pause).
    func start(of n: Int) -> String? {
        if let pausedFrom, n >= pausedFrom { return nil }
        let anchor = anchor(for: n)
        return GameDay.add((n - anchor.number) * GameSeason.days, to: anchor.startDay)
    }

    func calendar(of n: Int) -> SeasonCalendar? {
        guard let startDay = start(of: n), let endDay = GameDay.add(GameSeason.days - 1, to: startDay) else { return nil }
        return SeasonCalendar(
            number: n, startDay: startDay, endDay: endDay,
            weekKeys: (0..<GameSeason.weeks).compactMap { GameDay.add($0 * 7, to: startDay) },
            themeKey: byNumber[n]?.themeKey ?? GameSeason.themeKeys[(n - 1) % GameSeason.themeKeys.count]
        )
    }

    /// Le numéro de la dernière saison OUVERTE à ce jour (en cours ou close), `nil` avant la première.
    func lastStarted(at dayKey: String) -> Int? {
        guard let day = GameDay.number(of: dayKey) else { return nil }
        var index: Int?
        for (i, anchor) in anchors.enumerated() {
            if let start = GameDay.number(of: anchor.startDay), start <= day { index = i }
        }
        guard let index, let start = GameDay.number(of: anchors[index].startDay) else { return nil }
        let anchor = anchors[index]
        var n = anchor.number + (day - start) / GameSeason.days
        if index + 1 < anchors.count { n = min(n, anchors[index + 1].number - 1) }
        if let pausedFrom { n = min(n, pausedFrom - 1) }
        return n >= 1 && self.start(of: n) != nil ? n : nil
    }
}
