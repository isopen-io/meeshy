import Foundation

// MARK: - Le jour, la graine et le tirage du Jeu Meeshy (#9373)
//
// MIROIR de `packages/shared/utils/game/day-prng.ts`. Aucune horloge ni aucun
// aléa implicites : le jour est une CLÉ `AAAA-MM-JJ` que l'appelant calcule dans
// le fuseau de l'utilisateur, et le hasard est une suite déterministe dérivée de
// ce qu'il fournit. Le serveur et les clients qui reçoivent les mêmes entrées
// tirent donc les mêmes missions, le même coffre, la même Heure du Prisme.
//
// La graine est FNV-1a 32 bits sur les octets UTF-8 de `userId|jour|sel` ; la
// suite est mulberry32. Les deux n'emploient que des opérations entières sur 32
// bits (`&*`, `&+`, `>>`, `^`) et la division finale par 2^32 est exacte en
// double : `game.vectors.json` le prouve, rejoué par `GameLawVectorTests`.

/// Les opérations sur les clés de jour `AAAA-MM-JJ`.
///
/// Une clé illisible rend `nil` là où le TS lève : un client ne plante pas sur
/// une chaîne reçue du réseau, et les lois qui en dépendent (`GameFlame`)
/// traitent l'écart illisible comme « même jour » — elles ne changent rien.
public enum GameDay {

    /// `true` pour une vraie date du calendrier au format `AAAA-MM-JJ`.
    ///
    /// Les années 0000 à 0099 sont refusées, comme le TS (`Date.UTC` les ramène
    /// à 1900 et son aller-retour échoue) : un jeu qui date de 2026 n'en a pas
    /// besoin, et deux plateformes qui divergent sur une borne se contredisent.
    public static func isDayKey(_ value: String) -> Bool {
        civil(of: value) != nil
    }

    /// Nombre de jours écoulés depuis 1970-01-01, `nil` si la clé n'est pas une date.
    public static func number(of dayKey: String) -> Int? {
        guard let civil = civil(of: dayKey) else { return nil }
        return daysFromCivil(year: civil.year, month: civil.month, day: civil.day)
    }

    /// La clé `n` jours après (ou avant, si négatif) `dayKey`.
    public static func add(_ days: Int, to dayKey: String) -> String? {
        guard let base = number(of: dayKey) else { return nil }
        let civil = civilFromDays(base + days)
        return String(format: "%04d-%02d-%02d", civil.year, civil.month, civil.day)
    }

    /// Jours calendaires de `from` à `to` : positif quand `to` est après `from`.
    public static func diff(from: String, to: String) -> Int? {
        guard let start = number(of: from), let end = number(of: to) else { return nil }
        return end - start
    }

    /// `AAAA-MM` — sert à « une fois par mois ».
    public static func month(of dayKey: String) -> String {
        String(dayKey.prefix(7))
    }

    // MARK: Calendrier grégorien proleptique (Hinnant), sans `Calendar` ni fuseau

    private struct Civil {
        let year: Int
        let month: Int
        let day: Int
    }

    private static func civil(of dayKey: String) -> Civil? {
        let parts = dayKey.split(separator: "-", omittingEmptySubsequences: false)
        guard parts.count == 3,
              parts[0].count == 4, parts[1].count == 2, parts[2].count == 2,
              parts.allSatisfy({ $0.utf8.allSatisfy { (48...57).contains($0) } }),
              let year = Int(parts[0]), let month = Int(parts[1]), let day = Int(parts[2]),
              year >= 100, (1...12).contains(month),
              (1...daysIn(month: month, year: year)).contains(day) else { return nil }
        return Civil(year: year, month: month, day: day)
    }

    private static func isLeap(_ year: Int) -> Bool {
        (year % 4 == 0 && year % 100 != 0) || year % 400 == 0
    }

    private static func daysIn(month: Int, year: Int) -> Int {
        switch month {
        case 2: isLeap(year) ? 29 : 28
        case 4, 6, 9, 11: 30
        default: 31
        }
    }

    private static func daysFromCivil(year: Int, month: Int, day: Int) -> Int {
        let y = month <= 2 ? year - 1 : year
        let era = (y >= 0 ? y : y - 399) / 400
        let yoe = y - era * 400
        let doy = (153 * (month + (month > 2 ? -3 : 9)) + 2) / 5 + day - 1
        let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy
        return era * 146_097 + doe - 719_468
    }

    private static func civilFromDays(_ days: Int) -> Civil {
        let z = days + 719_468
        let era = (z >= 0 ? z : z - 146_096) / 146_097
        let doe = z - era * 146_097
        let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365
        let doy = doe - (365 * yoe + yoe / 4 - yoe / 100)
        let mp = (5 * doy + 2) / 153
        let day = doy - (153 * mp + 2) / 5 + 1
        let month = mp < 10 ? mp + 3 : mp - 9
        let year = yoe + era * 400 + (month <= 2 ? 1 : 0)
        return Civil(year: year, month: month, day: day)
    }
}

/// Ce qui fait la graine : l'utilisateur, le jour et un SEL qui sépare les
/// usages (`missions`, `chest`, `prism-hour`) — un même jour ne rejoue pas le
/// même tirage pour deux usages.
public struct GameSeedParts: Sendable, Equatable {
    public let userId: String
    public let dayKey: String
    public let salt: String

    public init(userId: String, dayKey: String, salt: String) {
        self.userId = userId
        self.dayKey = dayKey
        self.salt = salt
    }
}

public enum GameSeed {

    private static let fnvOffset: UInt32 = 0x811c_9dc5
    private static let fnvPrime: UInt32 = 0x0100_0193

    /// FNV-1a 32 bits sur les octets UTF-8.
    public static func fnv1a(_ text: String) -> UInt32 {
        text.utf8.reduce(fnvOffset) { hash, byte in (hash ^ UInt32(byte)) &* fnvPrime }
    }

    /// `fnv1a("userId|jour|sel")`.
    public static func seed(of parts: GameSeedParts) -> UInt32 {
        fnv1a("\(parts.userId)|\(parts.dayKey)|\(parts.salt)")
    }
}

/// mulberry32 : une suite déterministe de tirages dans [0, 1).
///
/// Une valeur, pas une classe : copier le générateur copie sa position, ce qui
/// rend un tirage rejouable sans état partagé.
public struct GameRandom: Sendable, Equatable {
    private var state: UInt32

    public init(seed: UInt32) {
        state = seed
    }

    public init(parts: GameSeedParts) {
        self.init(seed: GameSeed.seed(of: parts))
    }

    public mutating func next() -> Double {
        state = state &+ 0x6d2b_79f5
        var t = state
        t = (t ^ (t >> 15)) &* (t | 1)
        t ^= t &+ ((t ^ (t >> 7)) &* (t | 61))
        return Double(t ^ (t >> 14)) / 4_294_967_296.0
    }

    /// Un indice dans [0, length[ à partir d'un tirage — le tirage est CONSOMMÉ
    /// même quand `length` vaut 0 : le nombre de tirages d'un jeu de missions
    /// est fixe, c'est ce qui garde les clients alignés.
    public mutating func pickIndex(length: Int) -> Int {
        Int((next() * Double(length)).rounded(.down))
    }
}
