import Foundation
import MeeshySDK
import MeeshyUI

// MARK: - Les noms, les dates et les trophées de la vague 2 (#9384 à #9392, #9481)
//
// La loi (`MeeshySDK/Game`) rend des clés stables ; ce fichier les habille depuis
// `GameText` (les phrases du catalogue) et la locale de l'appareil. Miroir de
// `apps/web/src/lib/view/game-copy-v2.ts` : même séparation que `GameCopy`.

extension GameText {

    // MARK: Noms de la loi

    static func leagueName(_ league: LeagueKey) -> String {
        switch league {
        case .quartz: leagueNameQuartz
        case .ambre: leagueNameAmbre
        case .jade: leagueNameJade
        case .saphir: leagueNameSaphir
        case .rubis: leagueNameRubis
        case .amethyste: leagueNameAmethyste
        case .diamant: leagueNameDiamant
        case .prisme: leagueNamePrisme
        }
    }

    static func zoneLabel(_ zone: LeagueZone) -> String {
        switch zone {
        case .promotion: leagueZonePromotion
        case .safe: leagueZoneSafe
        case .relegation: leagueZoneRelegation
        }
    }

    static func cupName(_ cup: LeagueCup) -> String {
        switch cup {
        case .gold: leagueCupGold
        case .silver: leagueCupSilver
        case .bronze: leagueCupBronze
        }
    }

    static func visibilityLabel(_ level: ShowcaseVisibility) -> String {
        switch level {
        case .everyone: visibilityEveryone
        case .friends: visibilityFriends
        case .me: visibilityMe
        }
    }

    static func rarityName(_ rarity: GameGlory.AchievementRarity) -> String {
        switch rarity {
        case .common: rarityCommon
        case .rare: rarityRare
        case .epic: rarityEpic
        case .legendary: rarityLegendary
        case .mythic: rarityMythic
        }
    }

    static func seasonStepState(_ state: GameSeasonStepState) -> String {
        switch state {
        case .claimed: seasonStepClaimed
        case .ready: seasonStepReady
        case .locked: seasonStepLocked
        }
    }

    static func seasonRewardLabel(_ reward: SeasonReward) -> String {
        switch reward.kind {
        case .points: "+" + GameCopy.formatCount(reward.amount)
        case .fragment: seasonRewardFragment
        case .freeze: seasonRewardFreeze
        case .seasonCup: seasonRewardSeasonCup
        }
    }
}

/// L'état d'une étape de saison, dit par le TEXTE et pas seulement par la couleur.
enum GameSeasonStepState: Equatable {
    case claimed
    case ready
    case locked

    static func of(step: Int, in season: GameSeasonBlock) -> GameSeasonStepState {
        if season.claimedSteps.contains(step) { return .claimed }
        return step <= season.steps ? .ready : .locked
    }
}

/// Les dates et durées du jeu, dites par la locale de l'appareil — jamais écrites à la main.
enum GameWave2Format {

    /// Un jour `AAAA-MM-JJ` lu en UTC : une date locale ne glisse jamais d'un jour.
    private static func utcDate(_ dayKey: String) -> Date? {
        GameDay.number(of: dayKey).map { Date(timeIntervalSince1970: TimeInterval($0) * 86_400) }
    }

    private static func formatter(_ template: String, locale: Locale) -> DateFormatter {
        let formatter = DateFormatter()
        formatter.locale = locale
        formatter.timeZone = TimeZone(identifier: "UTC")
        formatter.setLocalizedDateFormatFromTemplate(template)
        return formatter
    }

    /// « 2 août 2026 » — un tampon, un jour de saison.
    static func day(_ dayKey: String, locale: Locale = .current) -> String {
        guard let date = utcDate(dayKey) else { return dayKey }
        return formatter("dMMMMy", locale: locale).string(from: date)
    }

    /// « Semaine du 2 novembre » : la semaine s'identifie par son lundi local.
    static func week(_ weekKey: String, locale: Locale = .current) -> String {
        guard let date = utcDate(weekKey) else { return GameText.leagueWeek(date: weekKey) }
        return GameText.leagueWeek(date: formatter("dMMMM", locale: locale).string(from: date))
    }

    /// « octobre 2026 » — ce qu'un VISITEUR voit d'un trophée : le mois, jamais le jour (conformité D-3).
    static func month(_ month: String, locale: Locale = .current) -> String {
        guard let date = utcDate(month + "-01") else { return month }
        return formatter("MMMMy", locale: locale).string(from: date)
    }

    /// « oct. 2026 » — la plaque d'une coupe de ligue vue par un visiteur.
    static func shortMonth(_ month: String, locale: Locale = .current) -> String {
        guard let date = utcDate(month + "-01") else { return month }
        return formatter("MMMy", locale: locale).string(from: date)
    }

    /// « 26 octobre 2026 » — la date d'un trophée vue PAR SON PROPRIÉTAIRE.
    static func awardedDate(_ iso: String, locale: Locale = .current) -> String {
        let parsers: [ISO8601DateFormatter] = [
            { let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]; return f }(),
            ISO8601DateFormatter(),
        ]
        guard let date = parsers.lazy.compactMap({ $0.date(from: iso) }).first else { return iso }
        let out = DateFormatter()
        out.locale = locale
        out.setLocalizedDateFormatFromTemplate("dMMMMy")
        return out.string(from: date)
    }

    /// Le nom d'une langue DANS la langue de l'interface (« Swahili », « Japonais »).
    static func languageName(_ code: String, locale: Locale = .current) -> String {
        guard let name = locale.localizedString(forLanguageCode: code), name.lowercased() != code.lowercased() else {
            return code.uppercased()
        }
        return name.prefix(1).uppercased(with: locale) + name.dropFirst()
    }

    /// Le thème d'une saison : aujourd'hui une langue (`language:sw`) ; un thème inconnu ne se nomme pas.
    static func seasonTheme(_ themeKey: String, locale: Locale = .current) -> String? {
        let parts = themeKey.split(separator: ":", maxSplits: 1).map(String.init)
        guard parts.count == 2, parts[0] == "language", !parts[1].isEmpty else { return nil }
        return languageName(parts[1], locale: locale)
    }

    /// Le temps qui reste avant la fermeture, CALME : des jours et des heures, puis des heures, puis
    /// des minutes — jamais de secondes qui défilent. La fermeture est le dimanche à 20 h, heure LOCALE.
    static func remaining(closes: GameLeagueBlock.Closes, now: Date, calendar: Calendar = .current,
                          locale: Locale = .current) -> String {
        let parts = closes.dayKey.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3,
              let day = calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2])),
              let target = calendar.date(byAdding: .minute, value: closes.minuteOfDay, to: day) else {
            return ""
        }
        let minutes = max(1, Int((target.timeIntervalSince(now) / 60).rounded(.up)))
        let days = minutes / (24 * 60)
        let hours = (minutes % (24 * 60)) / 60
        if days >= 1 {
            return GameText.durationDaysHours(days: GameCopy.formatCount(days), hours: GameCopy.formatCount(hours))
        }
        if hours >= 1 { return GameText.durationHours(hours: GameCopy.formatCount(minutes / 60)) }
        return GameText.durationMinutes(minutes: GameCopy.formatCount(minutes))
    }

    /// Le numéro de semaine ISO d'un lundi (`AAAA-MM-JJ`) — l'étiquette courte « S44 » d'une plaque de ligue.
    static func isoWeekNumber(_ dayKey: String) -> Int {
        var calendar = Calendar(identifier: .iso8601)
        calendar.timeZone = TimeZone(identifier: "UTC") ?? .current
        guard let date = utcDate(dayKey) else { return 0 }
        return calendar.component(.weekOfYear, from: date)
    }

    /// La part des comptes, en entiers dès 1 %, à une décimale sous 1 %, jamais sous 0,1 %.
    static func rarityPercent(_ share: Double, locale: Locale = .current) -> String {
        func format(_ value: Double, digits: Int) -> String {
            value.formatted(.number.locale(locale).precision(.fractionLength(digits)))
        }
        if share < 0.1 { return "< " + format(0.1, digits: 1) + " %" }
        return share < 1 ? format(share, digits: 1) + " %" : format(share.rounded(), digits: 0) + " %"
    }
}

// MARK: - Les trophées : une CLÉ rend sa coupe, son titre et sa plaque

struct GameTrophyPresentation: Equatable {
    enum Kind: Equatable {
        case league(LeagueCup)
        case season
        case prestige
        case flame

        /// La matière de la coupe : or, argent ou bronze pour la ligue, platine pour la saison, prisme pour le
        /// Prestige, la matière de la Flamme pour une série de 100 ou 365 jours.
        var material: GameMaterial {
            switch self {
            case .league(let cup):
                switch cup {
                case .gold: .gold
                case .silver: .silver
                case .bronze: .bronze
                }
            case .season: .platinum
            case .prestige: .prism
            case .flame: .flame
            }
        }
    }

    let kind: Kind
    /// Ce que lit VoiceOver : « Coupe d'or — ligue Jade, semaine du 26 octobre ».
    let title: String
    /// Ce que la plaque grave : « JADE · S44 », en capitales.
    let plate: String

    var material: GameMaterial { kind.material }

    /// Ce qu'une CLÉ montre. Une clé que ce client ne connaît pas (un trophée d'une version plus
    /// récente) rend `nil` : on ne nomme pas ce qu'on ne comprend pas, et la vitrine ne le montre pas.
    static func of(key: String, locale: Locale = .current) -> GameTrophyPresentation? {
        guard let spec = GameTrophies.parse(key) else { return nil }
        func upper(_ text: String) -> String { text.uppercased(with: locale) }
        switch spec {
        case .leagueCup(let period, let league, let cup):
            let leagueName = GameText.leagueName(league)
            let cupName = GameText.cupName(cup)
            switch period {
            case .month(let month):
                return GameTrophyPresentation(
                    kind: .league(cup),
                    title: GameText.trophyLeagueCupMonth(cup: cupName, league: leagueName, month: GameWave2Format.month(month, locale: locale)),
                    plate: GameText.trophyPlateLeagueMonth(league: upper(leagueName), month: upper(GameWave2Format.shortMonth(month, locale: locale)))
                )
            case .week(let week):
                let date = GameWave2Format.week(week, locale: locale)
                return GameTrophyPresentation(
                    kind: .league(cup),
                    title: GameText.trophyLeagueCup(cup: cupName, league: leagueName, date: date),
                    plate: GameText.trophyPlateLeague(league: upper(leagueName), week: GameCopy.formatCount(GameWave2Format.isoWeekNumber(week)))
                )
            }
        case .seasonCup(let season):
            let number = GameCopy.formatCount(season)
            return GameTrophyPresentation(kind: .season, title: GameText.trophySeasonCup(number: number),
                                          plate: GameText.trophyPlateSeason(number: number))
        case .prestige(let number):
            let formatted = GameCopy.formatCount(number)
            return GameTrophyPresentation(kind: .prestige, title: GameText.trophyPrestige(number: formatted),
                                          plate: GameText.trophyPlatePrestige(number: formatted))
        case .flame(let days):
            return GameTrophyPresentation(kind: .flame, title: GameText.trophyFlame(days: GameCopy.days(days)),
                                          plate: GameText.trophyPlateFlame(days: GameCopy.formatCount(days)))
        }
    }
}
