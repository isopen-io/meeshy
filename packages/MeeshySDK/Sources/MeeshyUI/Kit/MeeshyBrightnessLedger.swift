import Foundation

/// **La comptabilité de la luminosité poussée (K31)**, en valeurs : qui tient
/// l'écran au maximum, et quelle valeur lui rendre. La valeur d'avant se retient
/// à l'arrivée de la PREMIÈRE carte et ne revient qu'au départ de la DERNIÈRE :
/// deux cartes à l'écran (une feuille sur la fiche, une transition de pile) ne
/// laissent jamais l'écran bloqué au maximum. L'arrière-plan rend la valeur
/// d'avant sans oublier les cartes ; le retour au premier plan repousse.
///
/// Chaque mutation rend la luminosité à appliquer, ou `nil` quand rien ne change.
nonisolated struct MeeshyBrightnessLedger: Equatable, Sendable {
    static let boosted: Double = 1

    private(set) var holders: Set<UUID> = []
    private(set) var original: Double?
    private(set) var isSuspended = false

    mutating func acquire(_ holder: UUID, current: Double) -> Double? {
        guard holders.insert(holder).inserted else { return nil }
        guard !isSuspended else { return nil }
        if original == nil { original = current }
        return Self.boosted
    }

    mutating func release(_ holder: UUID) -> Double? {
        guard holders.remove(holder) != nil, holders.isEmpty else { return nil }
        let restored = original
        original = nil
        return restored
    }

    mutating func suspend() -> Double? {
        isSuspended = true
        let restored = original
        original = nil
        return restored
    }

    mutating func resume(current: Double) -> Double? {
        isSuspended = false
        guard !holders.isEmpty else { return nil }
        original = current
        return Self.boosted
    }
}
