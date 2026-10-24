import Foundation

/// L'HORLOGE D'ORDRE d'une modification — extraite de
/// `MessagePersistenceActor+EditDelete.swift` (#11375, cliquet de cohésion :
/// l'acteur ne grossit pas). Valeur pure : elle dit quelle date poser, ou
/// `nil` pour refuser la modification ; elle ne touche ni la base ni l'acteur.
enum MessageEditOrdering {

    /// Slack for the ordering guard — a strict `<` is unsafe across a GRDB
    /// `Date` round-trip (see `servedStamp`).
    static let tolerance: TimeInterval = 0.05

    /// L'écart qui date une édition LOCALE juste après la date stockée.
    static let localStep: TimeInterval = 0.001

    /// Ordering guard: `message:edited` carries no monotonic sequence, so a
    /// delayed/duplicate socket delivery can arrive after a newer edit was
    /// already applied. Comparing against the stored `editedAt` stops a
    /// stale edit from permanently clobbering the current content.
    ///
    /// A tolerance (rather than a strict `<`) is required: GRDB round-trips
    /// `Date` through a millisecond-precision text column, so re-applying
    /// the exact same in-memory `Date` twice (e.g. an optimistic edit
    /// followed by its own failure rollback, which reuses the same
    /// `editedAt`) can read back a value a fraction of a millisecond off
    /// from what was passed in — enough to misfire a strict comparison.
    /// Genuine out-of-order deliveries differ by network-delay magnitudes
    /// (well beyond this), so the tolerance doesn't weaken the guard.
    static func servedStamp(editedAt: Date, after stored: Date?) -> Date? {
        if let stored, editedAt.timeIntervalSince(stored) < -tolerance { return nil }
        return editedAt
    }

    /// Une édition de l'APPAREIL s'applique toujours, datée juste après la
    /// date stockée quand celle-ci (souvent SERVIE) est en avance sur `now`.
    static func localStamp(now: Date, after stored: Date?) -> Date {
        guard let stored, stored >= now else { return now }
        return stored.addingTimeInterval(localStep)
    }
}
