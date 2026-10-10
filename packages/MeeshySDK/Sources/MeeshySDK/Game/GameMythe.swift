import Foundation

// MARK: - Le Mythe (#9636) — cent places, dans l'ordre d'arrivée, et une émission par attribution
//
// MIROIR de `packages/shared/utils/game/mythe.ts` et `mythic-signature.ts`.
// La passerelle tient le registre et l'attribution atomique ; le client ne la
// calcule jamais — il sert la place et l'émission reçues, et DESSINE la
// Signature unique de l'émission (`GameMythe.signature(edition:)`).

/// Un gain de Gloire daté (ISO 8601).
public struct GloryGain: Sendable, Equatable {
    public let delta: Int
    public let createdAt: String

    public init(delta: Int, createdAt: String) {
        self.delta = delta
        self.createdAt = createdAt
    }
}

/// Un compte qui a franchi le seuil, et quand.
public struct MythicArrival: Sendable, Equatable {
    public let userId: String
    public let glory: Int
    public let crossedAt: String

    public init(userId: String, glory: Int, crossedAt: String) {
        self.userId = userId
        self.glory = glory
        self.crossedAt = crossedAt
    }
}

public struct MythicSeatGrant: Sendable, Equatable {
    public let userId: String
    public let number: Int
}

/// Un trait de la Signature unique (repère 1 024).
public struct MythicSignatureLine: Sendable, Equatable {
    public let x1: Double
    public let y1: Double
    public let x2: Double
    public let y2: Double
}

public struct MythicSignatureBead: Sendable, Equatable {
    public let cx: Double
    public let cy: Double
    public let r: Double
    public let slot: Int
}

/// La Signature unique d'une émission : une TABLE DE GÉOMÉTRIE dans le carré de 1 024.
public struct MythicSignatureDesign: Sendable, Equatable {
    public struct Halo: Sendable, Equatable {
        public let cx: Double
        public let cy: Double
        public let inner: Double
        public let outer: Double
        public let strokeWidth: Double
    }

    public struct Gem: Sendable, Equatable {
        public let cx: Double
        public let cy: Double
        public let r: Double
        public let orbit: Double
        public let angle: Double
    }

    public struct Engraving: Sendable, Equatable {
        public let x: Double
        public let y: Double
        public let size: Double
    }

    public let edition: Int
    /// Teinte de départ du prisme, en degrés entiers (0–359).
    public let hue: Int
    public let halo: Halo
    /// Les rayons du halo, le premier à midi, pas égal dans le sens horaire.
    public let rays: [MythicSignatureLine]
    public let gem: Gem
    /// Aucune perle pour les émissions 1 à 100.
    public let beads: [MythicSignatureBead]
    public let numeral: String
    public let engraving: Engraving
}

public enum GameMythe {

    public static let signatureBox: Double = 1024

    private static let center: Double = 512
    private static let halo = (inner: 380.0, outer: 430.0, strokeWidth: 28.0)
    private static let gem = (orbit: 478.0, r: 30.0)
    private static let beads = (orbit: 350.0, r: 9.0, slots: 12)
    private static let engraving = (x: 512.0, y: 800.0, size: 72.0)

    /// Le nombre d'émissions dont la géométrie seule est deux à deux distincte : 100 × 2¹².
    public static let geometrySpan = 100 * (1 << 12)

    // MARK: Places

    /// `true` quand cette Gloire ouvre droit à une place (s'il en reste une).
    public static func reachesMythe(_ glory: Int) -> Bool { glory >= GameGlory.mytheGlory }

    /// Les places libres, de la plus petite à la plus grande.
    public static func freeNumbers(taken: [Int]) -> [Int] {
        let held = Set(taken.filter(GameGlory.isMythicNumber))
        return (1...GameGlory.mytheSize).filter { !held.contains($0) }
    }

    /// La place que prend le prochain arrivant, `nil` quand les cent sont prises.
    public static func nextNumber(taken: [Int]) -> Int? { freeNumbers(taken: taken).first }

    /// L'instant où une suite de gains atteint le seuil pour la PREMIÈRE fois, `nil` sinon.
    public static func crossedAt(_ gains: [GloryGain]) -> String? {
        let ordered = GameOrdering.stableSorted(gains) { GameOrdering.compare($0.createdAt, $1.createdAt) }
        var total = 0
        for gain in ordered {
            total += gain.delta
            if total >= GameGlory.mytheGlory { return gain.createdAt }
        }
        return nil
    }

    /// L'ordre d'arrivée : instant de franchissement, puis identifiant (un compte = une entrée, la dernière lue).
    public static func arrivalOrder(_ arrivals: [MythicArrival]) -> [MythicArrival] {
        var order: [String] = []
        var latest: [String: MythicArrival] = [:]
        for arrival in arrivals {
            if latest[arrival.userId] == nil { order.append(arrival.userId) }
            latest[arrival.userId] = arrival
        }
        let unique = order.compactMap { latest[$0] }.filter { reachesMythe($0.glory) }
        return GameOrdering.stableSorted(unique) { lhs, rhs in
            let byTime = GameOrdering.compare(lhs.crossedAt, rhs.crossedAt)
            return byTime != 0 ? byTime : GameOrdering.compare(lhs.userId, rhs.userId)
        }
    }

    /// Les places qu'une attribution donne : aux arrivants sans place, dans l'ordre d'arrivée,
    /// chacun sur la plus petite place libre restante — jamais au-delà de la 100e.
    public static func assignSeats(taken: [Int], seated: [String], arrivals: [MythicArrival]) -> [MythicSeatGrant] {
        let seatedIds = Set(seated)
        let free = freeNumbers(taken: taken)
        let waiting = arrivalOrder(arrivals).filter { !seatedIds.contains($0.userId) }.prefix(free.count)
        return waiting.enumerated().map { index, arrival in MythicSeatGrant(userId: arrival.userId, number: free[index]) }
    }

    // MARK: La Signature unique

    /// L'arrondi au dixième de JavaScript (`Math.round`, demi vers +∞).
    static func tenth(_ value: Double) -> Double { ((value * 10) + 0.5).rounded(.down) / 10 }

    /// Le point à `radius` du centre, à `degrees` de midi dans le sens horaire.
    private static func polar(_ radius: Double, _ degrees: Double) -> (x: Double, y: Double) {
        let radians = degrees * .pi / 180
        return (tenth(center + radius * sin(radians)), tenth(center - radius * cos(radians)))
    }

    /// 12 rayons pour 1–10, 14 pour 11–20 … 30 pour 91–100, puis on recommence.
    public static func rayCount(edition: Int) -> Int { 12 + 2 * (((edition - 1) / 10) % 10) }

    /// L'angle de la gemme : 18° pour 1, 11, 21… ; 342° pour 10, 20, 30…
    public static func gemAngle(edition: Int) -> Int { 18 + 36 * ((edition - 1) % 10) }

    /// L'anneau : ⌊(e − 1) ÷ 100⌋ modulo 2¹² — ses bits sont les perles.
    public static func ring(edition: Int) -> Int { ((edition - 1) / 100) % (1 << beads.slots) }

    /// La teinte de départ du prisme : ⌊(e − 1) × 137,508 + ½⌋ mod 360, en entiers.
    public static func hue(edition: Int) -> Int { (((edition - 1) * 137_508 + 500) / 1000) % 360 }

    /// La Signature unique de l'émission `edition` (1, 2, 3…) ; `nil` pour une émission illisible.
    public static func signature(edition: Int) -> MythicSignatureDesign? {
        guard GameGlory.isMythicEdition(edition) else { return nil }
        let count = rayCount(edition: edition)
        let rays = (0..<count).map { k -> MythicSignatureLine in
            let degrees = 360 * Double(k) / Double(count)
            let from = polar(halo.inner, degrees)
            let to = polar(halo.outer, degrees)
            return MythicSignatureLine(x1: from.x, y1: from.y, x2: to.x, y2: to.y)
        }
        let angle = gemAngle(edition: edition)
        let gemCenter = polar(gem.orbit, Double(angle))
        let ringBits = ring(edition: edition)
        let placed = (0..<beads.slots).filter { (ringBits >> $0) & 1 == 1 }.map { slot -> MythicSignatureBead in
            let at = polar(beads.orbit, 15 + 30 * Double(slot))
            return MythicSignatureBead(cx: at.x, cy: at.y, r: beads.r, slot: slot)
        }
        return MythicSignatureDesign(
            edition: edition,
            hue: hue(edition: edition),
            halo: .init(cx: center, cy: center, inner: halo.inner, outer: halo.outer, strokeWidth: halo.strokeWidth),
            rays: rays,
            gem: .init(cx: gemCenter.x, cy: gemCenter.y, r: gem.r, orbit: gem.orbit, angle: Double(angle)),
            beads: placed,
            numeral: String(edition),
            engraving: .init(x: engraving.x, y: engraving.y, size: engraving.size)
        )
    }
}
