import Foundation

/// Le point de reprise de la synchronisation d'UN compte (#8674).
///
/// Les trois horloges du moteur vivent dans des clés `UserDefaults` globales :
/// elles décrivent le compte ACTIF. Un compte quitté sans être oublié emporte
/// les siennes avec son cache, pour qu'à son retour le delta reparte de là où
/// il s'était arrêté plutôt que de tout recharger.
public struct SyncCheckpoint: Codable, Equatable, Sendable {
    public var lastSync: Date?
    public var lastCleanup: Date?
    public var lastFullReconcile: Date?

    public init(lastSync: Date?, lastCleanup: Date?, lastFullReconcile: Date?) {
        self.lastSync = lastSync
        self.lastCleanup = lastCleanup
        self.lastFullReconcile = lastFullReconcile
    }
}
